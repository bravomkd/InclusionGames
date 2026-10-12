/* Shared test plumbing: start server.js as a real child process against a
   throwaway data directory, and talk to it over HTTP the way a browser does.
   Nothing here touches the project's own data/ folder.

   The child runs with cwd set to the temp directory on purpose: server.js calls
   require('dotenv').config(), which reads ./.env relative to cwd, so a developer's
   local .env would otherwise change what the tests see. */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ig-test-'));
}

function spawnServer(port, dataDir, env) {
  return spawn(process.execPath, [SERVER], {
    cwd: dataDir,                       // keeps the project's .env out of tests
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: `http://localhost:${port}`,
      DATA_DIR: dataDir,
      JWT_SECRET: 'test-secret-that-is-definitely-long-enough-0123456789',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/* Boot a server and resolve once /api/health answers, so tests never race listen(). */
async function startServer(env = {}) {
  const port = await freePort();
  const dataDir = env.DATA_DIR || tempDataDir();
  const child = spawnServer(port, dataDir, env);

  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (code ${child.exitCode}):\n${out}`);
    }
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`server did not start:\n${out}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    base,
    dataDir,
    output: () => out,
    usersFile: () => path.join(dataDir, 'users.json'),
    readUsers() {
      try { return JSON.parse(fs.readFileSync(this.usersFile(), 'utf8')); }
      catch { return null; }
    },
    get(p, opts) { return get(base, p, opts); },
    postJson(p, body, opts) { return postJson(base, p, body, opts); },
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => child.once('exit', r));
      }
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

/* Run server.js expecting it to refuse to boot. Resolves {code, output, dataDir}.
   code === null means it was still running after the timeout, i.e. it did NOT refuse. */
async function startServerExpectingExit(env = {}) {
  const port = await freePort();
  const dataDir = env.DATA_DIR || tempDataDir();
  const child = spawnServer(port, dataDir, env);
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 10000);
    child.once('exit', (c) => { clearTimeout(timer); resolve(c); });
  });
  return { code, output: out, dataDir };
}

/* fetch that never follows redirects, so tests can assert on the 302 itself. */
function get(base, p, opts = {}) {
  return fetch(base + p, { redirect: 'manual', ...opts });
}

function postJson(base, p, body, opts = {}) {
  const { headers, ...rest } = opts;
  return fetch(base + p, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
    ...rest,
  });
}

/* Register, verify the email, and log in. Returns { token, user, id }.
   The verification token is read straight out of the temp database, which is
   what the console-email flow gives a developer anyway. */
async function makeUser(srv, email, password = 'password123', name = 'Test User') {
  await srv.postJson('/api/auth/register', { name, email, password });
  const rec = (srv.readUsers() || []).find((u) => u.email === email.toLowerCase());
  if (!rec) throw new Error(`register did not create ${email}`);
  if (rec.verify_token) {
    await srv.get(`/api/auth/verify?token=${rec.verify_token}`);
  }
  const res = await srv.postJson('/api/auth/login', { email, password });
  const data = await res.json().catch(() => ({}));
  return { token: data.token, user: data.user, id: rec.id, status: res.status };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  startServer, startServerExpectingExit, get, postJson, makeUser, authHeader,
  freePort, tempDataDir,
};
