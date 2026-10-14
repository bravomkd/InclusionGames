/* Child profiles, and the things that must not be reachable across accounts.
   A child profile carries a name, a note a parent or teacher wrote about them
   and their play history. One account reading another's would be a breach of
   exactly the data this platform exists to hold carefully, so every route is
   checked from the wrong account as well as the right one. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeUser, authHeader } = require('./helpers');

test('child profiles are reachable only by the account that owns them', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const owner = await makeUser(srv, 'owner@example.com');
  const stranger = await makeUser(srv, 'stranger@example.com');

  const created = await (await srv.postJson('/api/children',
    { name: 'Mia', note: 'Prefers the quieter games.' },
    { headers: authHeader(owner.token) })).json();
  const childId = created.child.id;
  assert.ok(childId, 'the owner should be able to create a child');

  const patch = (id, body, token) => fetch(`${srv.base}/api/children/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(body),
  });

  await t.test('the owner can read and edit their own child', async () => {
    const got = await (await srv.get(`/api/children/${childId}`, { headers: authHeader(owner.token) })).json();
    assert.equal(got.child.name, 'Mia');
    assert.equal(got.child.note, 'Prefers the quieter games.');

    const res = await patch(childId, { name: 'Mia B.' }, owner.token);
    assert.equal(res.status, 200);
    const after = await (await srv.get(`/api/children/${childId}`, { headers: authHeader(owner.token) })).json();
    assert.equal(after.child.name, 'Mia B.');
  });

  await t.test('a stranger cannot edit it', async () => {
    const res = await patch(childId, { name: 'Renamed by someone else' }, stranger.token);
    assert.equal(res.status, 404);
    const after = await (await srv.get(`/api/children/${childId}`, { headers: authHeader(owner.token) })).json();
    assert.equal(after.child.name, 'Mia B.', 'the name must be unchanged');
  });

  await t.test('a stranger gets 404 on every route for that child', async () => {
    const h = { headers: authHeader(stranger.token) };
    const reads = [
      `/api/children/${childId}`,
      `/api/children/${childId}/analytics`,
      `/api/children/${childId}/settings/game02`,
    ];
    for (const p of reads) {
      const res = await srv.get(p, h);
      assert.equal(res.status, 404, `${p} should be 404 for a stranger (got ${res.status})`);
    }

    const writes = [
      [`/api/children/${childId}/progress`, { game: 'game02', correct: 5, total: 5 }],
      [`/api/children/${childId}/report/send`, { to: 'someone@example.com' }],
    ];
    for (const [p, body] of writes) {
      const res = await srv.postJson(p, body, h);
      assert.equal(res.status, 404, `${p} should be 404 for a stranger (got ${res.status})`);
    }
  });

  await t.test("a stranger cannot see the child in their own list", async () => {
    const mine = await (await srv.get('/api/children', { headers: authHeader(stranger.token) })).json();
    assert.ok(!mine.children.some((c) => c.id === childId),
      "another account's child must never appear in this list");
  });

  await t.test('a stranger cannot delete it', async () => {
    const res = await fetch(`${srv.base}/api/children/${childId}`, {
      method: 'DELETE', headers: authHeader(stranger.token),
    });
    assert.equal(res.status, 404);

    const still = await srv.get(`/api/children/${childId}`, { headers: authHeader(owner.token) });
    assert.equal(still.status, 200, 'the child must still be there afterwards');
  });

  await t.test('signed out, nothing is reachable at all', async () => {
    const res = await srv.get(`/api/children/${childId}`);
    assert.equal(res.status, 401);
  });
});

test('child input is bounded rather than trusted', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const u = await makeUser(srv, 'bounds@example.com');
  const h = { headers: authHeader(u.token) };

  await t.test('a name is required', async () => {
    const res = await srv.postJson('/api/children', { name: '   ' }, h);
    assert.equal(res.status, 400);
  });

  await t.test('an over-long name is refused, not silently stored', async () => {
    const res = await srv.postJson('/api/children', { name: 'x'.repeat(61) }, h);
    assert.equal(res.status, 400);
  });

  await t.test('a long note is truncated rather than stored whole', async () => {
    const res = await srv.postJson('/api/children', { name: 'Noted', note: 'n'.repeat(2000) }, h);
    assert.equal(res.status, 200);
    const id = (await res.json()).child.id;
    const got = await (await srv.get(`/api/children/${id}`, h)).json();
    assert.ok(got.child.note.length <= 500, `note kept at ${got.child.note.length} characters`);
  });

  await t.test('settings are only accepted for a real game id', async () => {
    const list = await (await srv.get('/api/children', h)).json();
    const id = list.children[0].id;
    const res = await fetch(`${srv.base}/api/children/${id}/settings/not-a-game`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader(u.token) },
      body: JSON.stringify({ words: ['x'] }),
    });
    assert.ok(res.status >= 400, `a bogus game id should be refused (got ${res.status})`);
  });
});
