#!/usr/bin/env node
// f5: press refresh on an app someone else shipped, and close the loop on what breaks.
//
//   node f5.mjs sweep                 read-only HTTP sweep of every target route
//   node f5.mjs run <target> [...]    Kane proves it live -> agent fixes the repo -> Kane re-checks
//   node f5.mjs report                rebuild RESULTS.md from runs/
//
// Nothing from a target repo is installed, built or executed. See lib/hostsim.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startHostSim } from './lib/hostsim.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'targets.json'), 'utf8'));
const CHECK_FILE = path.join(ROOT, 'checks', 'refresh.md');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const now = () => new Date().toISOString();

function objective(base, t) {
  return fs.readFileSync(CHECK_FILE, 'utf8').split('---').pop().trim()
    .replaceAll('{{base}}', base.replace(/\/$/, '')).replaceAll('{{route}}', t.route).replaceAll('{{screen}}', t.screen);
}

function kane(base, t, outFile) {
  return new Promise((resolve) => {
    const args = ['run', objective(base, t), '--url', base, '--agent', '--headless', '--timeout', '200', '--max-steps', '12'];
    const out = fs.createWriteStream(outFile);
    const p = spawn('kane-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.pipe(out); let err = ''; p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      out.end();
      let end = null;
      try { for (const l of fs.readFileSync(outFile, 'utf8').split('\n')) { if (l.includes('"run_end"')) end = JSON.parse(l); } } catch {}
      resolve({ code, status: end?.status || 'no_result', summary: end?.summary || err.slice(-400), reason: end?.reason, duration: end?.duration, file: path.relative(ROOT, outFile) });
    });
  });
}

// Kane's verdict is cross-checked against the stand-in's own request log. A pass only
// counts if, during that run, the browser really requested the route and got a 200.
// (Kept evidence of why: runs/_kept/nido-false-pass, a pass with no fix and no request.)
function witness(logFile, route, since) {
  let hits = [];
  try { hits = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.path === route && e.ts >= since); } catch {}
  return { requested: hits.length, statuses: hits.map((h) => h.status), ok: hits.length > 0 && hits.every((h) => h.status === 200), rule: hits.at(-1)?.why };
}
async function kaneWitnessed(sim, t, outFile, logFile) {
  const since = now();
  const k = await kane(sim.url, t, outFile);
  k.host_log = witness(logFile, t.route, since);
  k.kane_status = k.status;
  if (k.status === 'passed' && !k.host_log.ok) {
    k.status = 'failed';
    k.overruled = k.host_log.requested ? `Kane said passed, but the host answered ${k.host_log.statuses.join(',')} for ${t.route}` : `Kane said passed, but the browser never requested ${t.route} during the run`;
    k.summary = `OVERRULED BY HOST LOG: ${k.overruled}.\nKane's own text: ${k.summary}`;
  }
  return k;
}

function runAgent(agent, brief, cwd) {
  const env = { ...process.env }; for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  // The agent gets file tools only. It cannot run shell commands, so it cannot execute the
  // target's code, and the check lives outside its working directory.
  const r = agent === 'codex'
    ? spawnSync('codex', ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', brief], { cwd, env, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawnSync('claude', ['-p', brief, '--allowedTools', 'Read,Edit,Write,Glob,Grep', '--permission-mode', 'acceptEdits'], { cwd, env, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
  return (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr.slice(-1500) : '');
}

function diff(cwd) {
  spawnSync('git', ['add', '-A'], { cwd });
  const d = spawnSync('git', ['diff', '--cached'], { cwd, encoding: 'utf8' }).stdout || '';
  const files = (spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' }).stdout || '').trim().split('\n').filter(Boolean);
  return { patch: d, files };
}

async function runTarget(name, idx) {
  const t = TARGETS.find((x) => x.name === name); if (!t) throw new Error('unknown target ' + name);
  if (name.startsWith('_')) throw new Error('bad name'); const dir = path.join(ROOT, 'runs', name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const repo = path.resolve(ROOT, t.clone);
  if (!fs.existsSync(repo)) spawnSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '-q', '--depth', '1', '--no-tags', `https://github.com/${t.repo}`, repo], { stdio: 'inherit' });
  spawnSync('git', ['reset', '-q', '--hard'], { cwd: repo }); spawnSync('git', ['clean', '-qfd'], { cwd: repo });
  const v = { target: name, repo: t.repo, commit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim(), live: t.live, host: t.host, route: t.route, check_sha256: sha(CHECK_FILE), started: now(), rounds: [] };
  const say = (m) => console.log(`[${name}] ${m}`);
  const save = () => fs.writeFileSync(path.join(dir, 'verdict.json'), JSON.stringify(v, null, 2));

  say(`1/4 Kane on the live deployment ${t.live}${t.route}`);
  v.live_result = await kane(t.live, t, path.join(dir, '01-kane-live.ndjson')); say(`    -> ${v.live_result.status}`); save();
  if (v.live_result.status === 'passed') { v.verdict = 'survives refresh, nothing to fix'; save(); return v; }
  if (v.live_result.status !== 'failed') { v.verdict = 'Kane gave no result on live'; save(); return v; }

  const sim = await startHostSim({ origin: t.live, repoDir: repo, host: t.host, port: 4700 + idx, logFile: path.join(dir, 'hostsim.log.jsonl') });
  try {
    say(`2/4 Kane on the local host stand-in ${sim.url} (repo config as committed)`);
    v.local_before = await kaneWitnessed(sim, t, path.join(dir, '02-kane-local-before.ndjson'), path.join(dir, 'hostsim.log.jsonl')); say(`    -> ${v.local_before.status}`); save();
    if (v.local_before.status !== 'failed') { v.verdict = 'stand-in does not reproduce the live failure, stopping'; save(); return v; }

    let lastKane = v.live_result; const agents = t.agents || (process.env.F5_AGENTS || 'claude,codex,codex').split(',');
    for (let r = 1; r <= agents.length; r++) {
      const agent = agents[r - 1];
      const brief = [
        `A browser test agent (Kane CLI) checked the deployed app at ${t.live} and it FAILED. You are in a clone of the app's repository. It is deployed on ${t.host === 'vercel' ? 'Vercel' : 'Netlify'} as a static build.`,
        `The check that failed, word for word:\n${objective(t.live, t)}`,
        `Kane's report for the ${r === 1 || v.rounds[r - 2].unavailable ? 'live site' : 'local stand-in after the previous fix attempt, which was REJECTED'}:\nstatus: ${lastKane.status}\n${lastKane.summary}`,
        r > 1 && !v.rounds[r - 2].unavailable ? `Files changed so far: ${v.rounds[r - 2].files.join(', ') || 'none'}. That did not make the check pass. Find out why and correct it.` : '',
        `Fix the cause in this repository with the smallest change. You have file tools only and cannot run commands. Do not touch application behaviour that is unrelated. After you finish, Kane will run the same check again; you do not get to edit the check. End with one line: what you changed and why.`,
      ].filter(Boolean).join('\n\n');
      fs.writeFileSync(path.join(dir, `03-round${r}-brief.md`), brief);
      say(`3/4 round ${r}: ${agent} is fixing`);
      const before = sha(CHECK_FILE);
      const outText = runAgent(agent, brief, repo);
      fs.writeFileSync(path.join(dir, `03-round${r}-${agent}.md`), outText);
      if (/Failed to authenticate|not logged in|ENOENT|Invalid API key/i.test(outText) && !diff(repo).files.length) {
        say(`    ${agent} is not available on this machine (not logged in), moving to the next agent`);
        v.rounds.push({ round: r, agent, unavailable: true, files: [], check_untouched: true, kane: { status: 'skipped', summary: 'agent unavailable' } }); save(); continue;
      }
      const d = diff(repo); fs.writeFileSync(path.join(dir, `03-round${r}.patch`), d.patch);
      const round = { round: r, agent, files: d.files, check_untouched: sha(CHECK_FILE) === before };
      say(`    changed: ${d.files.join(', ') || 'nothing'}`);
      say(`4/4 round ${r}: Kane re-runs the frozen check`);
      round.kane = await kaneWitnessed(sim, t, path.join(dir, `04-round${r}-kane-recheck.ndjson`), path.join(dir, 'hostsim.log.jsonl')); say(`    -> ${round.kane.status}${round.kane.overruled ? ' (' + round.kane.overruled + ')' : ''}`);
      v.rounds.push(round); save(); lastKane = round.kane;
      if (round.kane.status === 'passed') break;
    }
    const final = v.rounds.at(-1);
    v.fixed = final?.kane.status === 'passed';
    v.verdict = v.fixed ? `fixed in ${v.rounds.length} round(s)` : 'not fixed';
    if (v.fixed) fs.writeFileSync(path.join(dir, 'fix.patch'), diff(repo).patch);
  } finally { await sim.close(); v.finished = now(); save(); }
  return v;
}

async function sweep() {
  const rows = [];
  for (const t of TARGETS) {
    const get = async (u) => { try { return (await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 f5-sweep' } })).status; } catch { return 0; } };
    rows.push({ name: t.name, live: t.live, route: t.route, home: await get(t.live), refresh: await get(t.live.replace(/\/$/, '') + t.route), at: now() });
    console.log(rows.at(-1));
  }
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'runs', 'sweep.json'), JSON.stringify(rows, null, 2));
}

function report() {
  const L = ['# Results', '', `Generated ${now()} by \`node f5.mjs report\` from the files in \`runs/\`.`, ''];
  const sw = path.join(ROOT, 'runs', 'sweep.json');
  if (fs.existsSync(sw)) {
    const rows = JSON.parse(fs.readFileSync(sw, 'utf8'));
    L.push('## HTTP sweep (read-only)', '', `${rows.filter((r) => r.home === 200 && r.refresh === 404).length} of ${rows.length} live apps answer 404 when a real page is refreshed.`, '', '| App | Page | Home | Same page after refresh |', '|---|---|---|---|');
    for (const r of rows) L.push(`| ${r.live} | \`${r.route}\` | ${r.home} | **${r.refresh}** |`);
    L.push('');
  }
  L.push('## Kane proof and fix loop', '', '| App (repo) | Kane, live | Kane, stand-in before | Rounds | Kane after fix | Files changed | Evidence |', '|---|---|---|---|---|---|---|');
  for (const t of TARGETS) {
    const f = path.join(ROOT, 'runs', t.name, 'verdict.json'); if (!fs.existsSync(f)) continue;
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rounds = v.rounds.map((r) => `${r.round}: ${r.agent} -> ${r.unavailable ? 'not logged in, skipped' : r.kane.status}${r.kane.overruled ? ' (Kane pass overruled by host log)' : ''}`).join('<br>') || '-';
    L.push(`| [${v.repo}](https://github.com/${v.repo}) | ${v.live_result?.status} | ${v.local_before?.status || '-'} | ${rounds} | ${v.rounds.at(-1)?.kane.status || '-'} | ${v.rounds.at(-1)?.files.join(', ') || '-'} | [runs/${t.name}](runs/${t.name}) |`);
  }
  fs.writeFileSync(path.join(ROOT, 'RESULTS.md'), L.join('\n') + '\n'); console.log(L.join('\n'));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'sweep') await sweep();
else if (cmd === 'report') report();
else if (cmd === 'run') {
  const names = rest.length ? rest : TARGETS.filter((t) => t.clone).map((t) => t.name);
  const res = await Promise.all(names.map((n) => runTarget(n, TARGETS.findIndex((t) => t.name === n)).catch((e) => ({ target: n, verdict: 'error: ' + e.message }))));
  for (const v of res) console.log(`${v.target}: ${v.verdict}`);
  report();
} else console.log('usage: node f5.mjs sweep | run [target...] | report');
