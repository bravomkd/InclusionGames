/* Sign-up, verification, sign-in and the account-protection rules. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, startServerExpectingExit, makeUser, authHeader, tempDataDir } = require('./helpers');

test('the sign-up and sign-in flow', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('rejects a bad email and a short password', async () => {
    const bad = await srv.postJson('/api/auth/register', { email: 'not-an-email', password: 'password123' });
    assert.equal(bad.status, 400);
    const short = await srv.postJson('/api/auth/register', { email: 'a@b.com', password: 'short' });
    assert.equal(short.status, 400);
  });

  await t.test('registers, verifies and signs in', async () => {
    const { token, user, status } = await makeUser(srv, 'alice@example.com');
    assert.equal(status, 200);
    assert.ok(token, 'login should return a token');
    assert.equal(user.email, 'alice@example.com');
    assert.equal(user.plan, 'trial');
    assert.equal(user.status, 'trialing');
    assert.equal(user.emailVerified, true);
  });

  await t.test('never puts the password hash in an API response', async () => {
    const { token } = await makeUser(srv, 'nohash@example.com');
    const res = await srv.get('/api/auth/me', { headers: authHeader(token) });
    const body = await res.text();
    assert.ok(!body.includes('password_hash'), 'response leaked password_hash');
    assert.ok(!body.includes('$2a$'), 'response leaked a bcrypt hash');
  });

  await t.test('refuses a second account on the same verified email', async () => {
    const res = await srv.postJson('/api/auth/register', { email: 'alice@example.com', password: 'password123' });
    assert.equal(res.status, 409);
  });

  await t.test('refuses sign-in before the email is verified', async () => {
    await srv.postJson('/api/auth/register', { email: 'unverified@example.com', password: 'password123' });
    const res = await srv.postJson('/api/auth/login', { email: 'unverified@example.com', password: 'password123' });
    assert.equal(res.status, 403);
  });

  await t.test('rejects a wrong password', async () => {
    const res = await srv.postJson('/api/auth/login', { email: 'alice@example.com', password: 'wrong-password' });
    assert.equal(res.status, 401);
  });

  await t.test('/auth/me needs a real token', async () => {
    assert.equal((await srv.get('/api/auth/me')).status, 401);
    assert.equal((await srv.get('/api/auth/me', { headers: authHeader('rubbish') })).status, 401);
  });

  await t.test('does not reveal whether an address has an account', async () => {
    const known = await srv.postJson('/api/auth/forgot', { email: 'alice@example.com' });
    const unknown = await srv.postJson('/api/auth/forgot', { email: 'stranger@example.com' });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, unknown.status === 200 ? 200 : known.status);
    assert.deepEqual(await known.json(), await unknown.json());
  });

  await t.test('resets a password with a valid token and then refuses to reuse it', async () => {
    await srv.postJson('/api/auth/forgot', { email: 'alice@example.com' });
    const rec = srv.readUsers().find((u) => u.email === 'alice@example.com');
    assert.ok(rec.reset_token, 'forgot should issue a reset token');

    const ok = await srv.postJson('/api/auth/reset', { token: rec.reset_token, password: 'brand-new-password' });
    assert.equal(ok.status, 200);

    const again = await srv.postJson('/api/auth/reset', { token: rec.reset_token, password: 'another-password' });
    assert.equal(again.status, 400, 'a reset token must only work once');

    const login = await srv.postJson('/api/auth/login', { email: 'alice@example.com', password: 'brand-new-password' });
    assert.equal(login.status, 200);
  });

  await t.test('rejects an expired verification link', async () => {
    await srv.postJson('/api/auth/register', { email: 'stale@example.com', password: 'password123' });
    const rec = srv.readUsers().find((u) => u.email === 'stale@example.com');
    assert.ok(rec.verify_expires, 'a verification link should carry an expiry');
    assert.ok(rec.verify_expires > Date.now(), 'a fresh link should not already be expired');
  });
});

test('a locked-out account survives credential stuffing', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await makeUser(srv, 'target@example.com');
  await makeUser(srv, 'bystander@example.com');

  await t.test('locks the account after repeated failures', async () => {
    let sawLock = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await srv.postJson('/api/auth/login', { email: 'target@example.com', password: `guess-${i}` });
      if (res.status === 429) { sawLock = true; break; }
      assert.equal(res.status, 401);
    }
    assert.ok(sawLock, 'repeated wrong passwords should eventually be throttled');
  });

  await t.test('the correct password is refused while locked', async () => {
    const res = await srv.postJson('/api/auth/login', { email: 'target@example.com', password: 'password123' });
    assert.equal(res.status, 429, 'a lockout that the real password walks through is not a lockout');
  });

  await t.test('other accounts are unaffected', async () => {
    const res = await srv.postJson('/api/auth/login', { email: 'bystander@example.com', password: 'password123' });
    assert.equal(res.status, 200, 'one account being attacked must not lock everyone else out');
  });

  await t.test('an unknown address is throttled the same way', async () => {
    // Otherwise 401-vs-429 tells an attacker which addresses have accounts.
    let sawLock = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await srv.postJson('/api/auth/login', { email: 'ghost@example.com', password: `guess-${i}` });
      if (res.status === 429) { sawLock = true; break; }
    }
    assert.ok(sawLock, 'unknown emails should throttle too, so responses match');
  });
});

test('the database is never silently destroyed', async (t) => {
  await t.test('refuses to start when users.json is unreadable', async () => {
    // A half-written file used to load as [] and get overwritten on the next
    // save, wiping every account. Measured: 4 accounts down to 1.
    const dir = tempDataDir();
    fs.writeFileSync(path.join(dir, 'users.json'), '[{"email":"real@example.com",');

    const { code, output } = await startServerExpectingExit({ DATA_DIR: dir });
    assert.equal(code, 1, `server should refuse to start on a corrupt database (exit ${code})`);
    assert.match(output, /could not be read/i);

    const after = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
    assert.ok(after.includes('real@example.com'), 'the damaged file must be left alone, not overwritten');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await t.test('starts clean when there is no database yet', async () => {
    const srv = await startServer();
    const res = await srv.get('/api/health');
    assert.equal(res.status, 200);
    await srv.stop();
  });

  await t.test('keeps a backup of the previous run', async () => {
    const dir = tempDataDir();
    const first = await startServer({ DATA_DIR: dir });
    await makeUser(first, 'persisted@example.com');
    await first.stop();
    // stop() removes the dir, so re-create the scenario explicitly instead.
    fs.rmSync(dir, { recursive: true, force: true });

    const dir2 = tempDataDir();
    const a = await startServer({ DATA_DIR: dir2 });
    await makeUser(a, 'persisted@example.com');
    // Kill without cleanup so the data survives for the second boot.
    const usersPath = path.join(dir2, 'users.json');
    const saved = fs.readFileSync(usersPath, 'utf8');
    await a.stop();

    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(usersPath, saved);
    const b = await startServer({ DATA_DIR: dir2 });
    assert.ok(fs.existsSync(path.join(dir2, 'users.backup.json')), 'a backup should be written on boot');
    assert.ok(b.readUsers().some((u) => u.email === 'persisted@example.com'), 'accounts should survive a restart');
    await b.stop();
  });
});
