#!/usr/bin/env node
// dare: anyone types, in plain English, how they think a live AI-built app breaks.
// Kane CLI goes and tries it in a real browser and decides. Real bugs score points.
//
//   node dare.mjs serve            UI + API on http://127.0.0.1:4600
//   node dare.mjs house            run the house dares against every app (benchmark)
//
// Dares are read-only: Kane is told not to sign in, submit data or buy anything.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(path.join(DATA, 'kane'), { recursive: true });
const BOARD = path.join(DATA, 'board.json');
const APPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'targets.json'), 'utf8')).filter((a) => !a.note);
const HOUSE = JSON.parse(fs.readFileSync(path.join(ROOT, 'checks', 'house-dares.json'), 'utf8'));
const POINTS = { confirmed: 10, first_blood: 5 };

// One Kane run at a time: parallel runs were seen landing on each other's pages.
let dares = fs.existsSync(BOARD) ? JSON.parse(fs.readFileSync(BOARD, 'utf8')) : [];
const save = () => fs.writeFileSync(BOARD, JSON.stringify(dares, null, 1));

// The dare is a claim that something is broken. Kane is asked to go and see whether the
// bug IS there. Kane passes -> it saw the bug -> real bug. An assertion fails -> the app
// survived. Anything else (timeout, blocked, browser closed) is no ruling and no points.
// (First version asked Kane to assert the app was correct; Kane then "passed" a run whose
// own summary described the bug, so the question is now asked the direct way round.)
export function objective(app, text) {
  return [
    `A visitor reports a bug in the web app at ${app.live} . Their report, in their own words: "${text.replace(/"/g, "'")}"`,
    `Do what the report describes, the way a normal visitor would.`,
    `Rules: read-only. Do not sign in, do not create an account, do not submit any form that sends data, do not buy anything.`,
    `Assert that the reported bug is really present: what the report says goes wrong does go wrong.`,
  ].join('\n');
}

function kane(app, text, outFile) {
  return new Promise((resolve) => {
    const p = spawn('kane-cli', ['run', objective(app, text), '--url', app.live, '--agent', '--headless', '--timeout', '170', '--max-steps', '14'], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.pipe(fs.createWriteStream(outFile));
    p.on('close', () => {
      let end = null;
      try { for (const l of fs.readFileSync(outFile, 'utf8').split('\n')) if (l.includes('"run_end"')) end = JSON.parse(l); } catch {}
      resolve({ status: end?.status || 'no_result', reason: end?.reason || '', summary: end?.summary || '', duration: end?.duration });
    });
  });
}

export function verdict(k) {
  if (k.status === 'passed') return 'confirmed';
  if (k.status === 'failed' && /assertion|verification failed/i.test(k.reason)) return 'rejected';
  return 'inconclusive';
}

const queue = []; let running = 0; const MAX = Number(process.env.DARE_PARALLEL || 1);
function pump() {
  while (running < MAX && queue.length) {
    const d = queue.shift(); running++; d.status = 'running'; save();
    const app = APPS.find((a) => a.name === d.app);
    kane(app, d.dare, path.join(DATA, 'kane', d.id + '.ndjson')).then((k) => {
      d.kane = { ...k, file: `data/kane/${d.id}.ndjson` }; d.status = verdict(k); d.points = 0;
      if (d.status === 'confirmed') {
        const first = !dares.some((x) => x !== d && x.app === d.app && x.status === 'confirmed');
        d.points = POINTS.confirmed + (first ? POINTS.first_blood : 0); d.first_blood = first;
      }
      d.finished = new Date().toISOString(); running--; save(); pump();
    });
  }
}
function addDare(player, appName, text) {
  const d = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), player: player.slice(0, 30), app: appName, dare: text.slice(0, 400), status: 'queued' };
  dares.push(d); save(); queue.push(d); pump(); return d;
}

function board() {
  const players = {};
  for (const d of dares) { const p = (players[d.player] ||= { player: d.player, points: 0, confirmed: 0, rejected: 0, inconclusive: 0, pending: 0 }); p.points += d.points || 0; if (p[d.status] !== undefined) p[d.status]++; else p.pending++; }
  const apps = APPS.map((a) => { const ds = dares.filter((d) => d.app === a.name); return { name: a.name, live: a.live, repo: a.clone ? a.repo : null, bugs: ds.filter((d) => d.status === 'confirmed').length, survived: ds.filter((d) => d.status === 'rejected').length, dares: ds.length }; });
  return { players: Object.values(players).sort((a, b) => b.points - a.points), apps: apps.sort((a, b) => b.bugs - a.bugs), dares: [...dares].reverse(), busy: running + queue.length };
}

const [cmd] = process.argv.slice(2);
if (cmd === 'house') {
  for (const a of APPS) for (const h of HOUSE) if (!dares.some((d) => d.app === a.name && d.dare === h.dare)) addDare('house', a.name, h.dare);
  const t = setInterval(() => { process.stdout.write(`\r${dares.filter((d) => d.finished).length}/${dares.length} judged `); if (!running && !queue.length) { clearInterval(t); console.log('\ndone'); } }, 3000);
} else if (cmd === 'serve') {
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/api/board') return json(board());
    if (u.pathname === '/api/dare' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        try { const { player, app, dare } = JSON.parse(b);
          if (!player?.trim() || !dare?.trim() || !APPS.some((a) => a.name === app)) return json({ error: 'need player, app and dare' }, 400);
          json(addDare(player.trim(), app, dare.trim()));
        } catch { json({ error: 'bad request' }, 400); }
      }); return;
    }
    if (u.pathname.startsWith('/data/kane/')) { const f = path.join(DATA, 'kane', path.basename(u.pathname)); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(fs.readFileSync(f)); } }
    if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(ROOT, 'public', 'index.html'))); }
    res.writeHead(404); res.end('not found');
  }).listen(4600, '127.0.0.1', () => console.log('dare board on http://127.0.0.1:4600'));
} else console.log('usage: node dare.mjs serve | house');
