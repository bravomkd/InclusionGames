/* End-to-end feature test for the new Reports section, against the running
   server. Creates a throwaway account + child, plays some synthetic sessions,
   then exercises every reports endpoint. Removes the account at the end. */
require('dotenv').config({ path: '/var/www/inclusion/.env' });
const path = require('path'), fs = require('fs');
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3003);
const USERS = '/var/www/inclusion/data/users.json';
let pass = 0, fail = 0;
const check = (l, c, d) => { c ? (pass++, console.log(`  ok    ${l}${d?'  → '+d:''}`))
                               : (fail++, console.log(`  FAIL  ${l}${d?'  → '+d:''}`)); };
const j = async (u, o) => { const r = await fetch(u, o); let b=null; try{b=await r.json()}catch{} return {status:r.status, body:b, headers:r.headers}; };

const EMAIL = `report-e2e-${Date.now()}@inclusion-games.com`, PASS = 'RepTest!x9k2';
const H = t => ({ 'Content-Type':'application/json', Authorization:'Bearer '+t });

(async () => {
  console.log('\nReports end-to-end\n');
  await j(BASE+'/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name:'Report Tester', email:EMAIL, password:PASS})});
  let me = null;
  for (let i=0;i<25 && !me;i++){ delete require.cache[require.resolve(USERS)];
    const u=require(USERS); me=(Array.isArray(u)?u:Object.values(u)).find(x=>x.email===EMAIL);
    if(!me) await new Promise(s=>setTimeout(s,100)); }
  check('throwaway account created', !!me);
  await fetch(`${BASE}/api/auth/verify?token=${me.verify_token}`);
  const tok = (await j(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:EMAIL,password:PASS})})).body.token;
  check('signed in', !!tok);

  let r = await j(BASE+'/api/children', {method:'POST', headers:H(tok), body:JSON.stringify({name:'Zofia Wiśniewska'})});
  const kid = r.body && r.body.child;
  check('child profile created', !!kid, kid && kid.id);

  // Synthetic play history across several games and days.
  const GAMES=['game01','game07','game11','game16','game33'];
  const day=86400000;
  let posted=0;
  for (let i=0;i<24;i++){
    const total=10;
    const rr = await j(`${BASE}/api/children/${kid.id}/progress`, {method:'POST', headers:H(tok),
      body: JSON.stringify({ game:GAMES[i%GAMES.length], score:Math.min(total,4+Math.round(i/4)),
        total, timeMs:180000, at: Date.now()-(23-i)*day })});
    if (rr.status<300) posted++;
  }
  check('progress recorded', posted===24, posted+'/24 sessions');

  r = await j(`${BASE}/api/children/${kid.id}/analytics?range=30`, {headers:H(tok)});
  check('GET analytics', r.status===200, 'HTTP '+r.status);
  const rep = r.body && r.body.report;
  if (rep) {
    check('overview has sessions', rep.overview && rep.overview.sessions>0, 'sessions='+rep.overview.sessions);
    check('accuracy computed', rep.overview.accuracy!=null, rep.overview.accuracy+'%');
    check('per-game breakdown present', Array.isArray(rep.byGame) && rep.byGame.length>0, (rep.byGame||[]).length+' games');
    check('per-day timeline present', Array.isArray(rep.timeline) && rep.timeline.length>0, (rep.timeline||[]).length+' days');
    check('skill areas present', Array.isArray(rep.bySkill) && rep.bySkill.length>0,
      (rep.bySkill||[]).map(a=>a.cat+':'+a.questionsAnswered).join(' '));
    check('recent sessions listed', Array.isArray(rep.recentSessions) && rep.recentSessions.length>0, (rep.recentSessions||[]).length);
    // The conservative rule this feature was built around: no skill is called a
    // strength or a weakness on fewer than 20 answered questions.
    const named = [].concat(rep.strengths||[], rep.focus||[]);
    const rash = named.filter(a => (a.questionsAnswered||0) < rep.minAnswersForVerdict);
    check('no verdict on thin data', rash.length===0,
      rash.length ? rash.map(a=>a.cat+' '+a.questionsAnswered).join(',')
                  : `threshold ${rep.minAnswersForVerdict}, ${named.length} verdict(s) given`);
  }

  for (const lang of ['en','de','pl','es']) {
    const rr = await fetch(`${BASE}/api/children/${kid.id}/report.pdf?range=30&lang=${lang}`, {headers:H(tok)});
    const buf = Buffer.from(await rr.arrayBuffer());
    check(`PDF renders (${lang})`, rr.status===200 && buf.slice(0,5).toString()==='%PDF-',
      'HTTP '+rr.status+' '+buf.length+'B');
  }
  const dl = await fetch(`${BASE}/api/children/${kid.id}/report.pdf?download=1`, {headers:H(tok)});
  check('download=1 sets attachment', /attachment/.test(dl.headers.get('content-disposition')||''),
    dl.headers.get('content-disposition'));

  r = await j(`${BASE}/api/children/${kid.id}/report/send`, {method:'POST', headers:H(tok),
    body: JSON.stringify({to:'not-an-email', note:'x'})});
  check('send rejects a bad address', r.status===400, 'HTTP '+r.status);

  // Another account must not be able to read this child.
  r = await j(`${BASE}/api/children/${kid.id}/analytics`, {headers:H('rubbish')});
  check('analytics needs a valid token', r.status===401, 'HTTP '+r.status);
  r = await j(`${BASE}/api/children/does-not-exist/analytics`, {headers:H(tok)});
  check('unknown child is 404', r.status===404, 'HTTP '+r.status);

  // Cleanup goes through the API, not the file. The server keeps users in
  // memory, so a directly-edited users.json is written straight back over by
  // the next saveNow() — which is how an earlier run of this script leaked an
  // account that the script itself reported as deleted.
  const del = await j(BASE+'/api/auth/delete-account', {method:'POST', headers:H(tok),
    body: JSON.stringify({password: PASS})});
  await new Promise(s=>setTimeout(s,300));
  delete require.cache[require.resolve(USERS)];
  const still = (()=>{const u=require(USERS);return (Array.isArray(u)?u:Object.values(u)).some(x=>x.email===EMAIL)})();
  check('throwaway account removed', !still, still ? 'STILL PRESENT — remove '+EMAIL : 'HTTP '+del.status);

  console.log(`\n  ${pass} passed · ${fail} failed\n`);
  process.exit(fail?1:0);
})();
