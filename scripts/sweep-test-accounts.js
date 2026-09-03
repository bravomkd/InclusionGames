/* Remove accounts left behind by the test scripts. Goes through the API so the
   server ' s in-memory copy is updated too — editing users.json directly is
   silently undone by the next save. */
const BASE = "http://127.0.0.1:" + (process.env.PORT || 3003);
const PASSWORDS = ["RepTest!x9k2"];   // constants used by scripts/reports-e2e.js
const PATTERN = /^(qa-|report-e2e-|pentest-)/;
const path = require("path");
const f = path.join(__dirname, "..", "data", "users.json");
(async () => {
  delete require.cache[require.resolve(f)];
  const u = require(f);
  const targets = (Array.isArray(u) ? u : Object.values(u)).filter(x => PATTERN.test(x.email));
  if (!targets.length) return console.log("nothing to sweep.");
  for (const t of targets) {
    let done = false;
    for (const pw of PASSWORDS) {
      const l = await (await fetch(BASE + "/api/auth/login", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: t.email, password: pw }) })).json();
      if (!l.token) continue;
      const d = await fetch(BASE + "/api/auth/delete-account", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + l.token },
        body: JSON.stringify({ password: pw }) });
      console.log("  deleted " + t.email + "  HTTP " + d.status);
      done = true; break;
    }
    if (!done) console.log("  COULD NOT sign in to " + t.email + " — remove it by hand");
  }
  await new Promise(s => setTimeout(s, 400));
  delete require.cache[require.resolve(f)];
  const v = require(f); const a = Array.isArray(v) ? v : Object.values(v);
  console.log("\n" + a.length + " accounts; leftovers: " + a.filter(x => PATTERN.test(x.email)).length);
})();
