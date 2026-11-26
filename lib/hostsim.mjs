// hostsim: a tiny stand-in for the static host (Vercel or Netlify) of a deployed SPA.
//
// The built bundle is NOT rebuilt and no code from the target repo is executed on this
// machine. Asset files (anything with a file extension) are fetched read-only from the
// live deployment. What hostsim decides locally is the one thing under test: what the
// host answers for a path that is not a file, using the routing config found in the
// target repo clone (vercel.json, public/_redirects, netlify.toml). The config is read
// again on every request, so an agent's edit takes effect without a restart.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2' };

function vercelPattern(source) {
  // path-to-regexp subset used in vercel.json: :name*, :name, and raw regex groups
  let s = source.replace(/:[A-Za-z_]+\*/g, '.*').replace(/:[A-Za-z_]+\+/g, '.+').replace(/:[A-Za-z_]+/g, '[^/]+');
  return new RegExp('^' + s + '$');
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// Returns { serveIndex: bool, rule: string } for a non-file path.
export function routeDecision(host, repoDir, p) {
  if (host === 'vercel') {
    const cfg = readJson(path.join(repoDir, 'vercel.json'));
    if (!cfg) return { serveIndex: false, rule: 'no vercel.json' };
    for (const r of cfg.rewrites || []) {
      if (!r.source || !r.destination) continue;
      let re; try { re = vercelPattern(r.source); } catch { continue; }
      if (re.test(p)) {
        const ok = /^\/(index\.html)?$/.test(r.destination);
        return { serveIndex: ok, rule: `vercel.json rewrite ${r.source} -> ${r.destination}` };
      }
    }
    for (const r of cfg.routes || []) {
      if (!r.src || !r.dest) continue;
      let re; try { re = new RegExp('^' + r.src + '$'); } catch { continue; }
      if (re.test(p)) return { serveIndex: /^\/(index\.html)?$/.test(r.dest), rule: `vercel.json route ${r.src} -> ${r.dest}` };
    }
    return { serveIndex: false, rule: 'vercel.json has no matching rewrite' };
  }
  if (host === 'netlify') {
    // Netlify reads _redirects from the publish directory. For a Vite app that is dist/,
    // and only files under public/ are copied there. A _redirects in the repo root is ignored.
    const red = path.join(repoDir, 'public', '_redirects');
    if (fs.existsSync(red)) {
      for (const line of fs.readFileSync(red, 'utf8').split('\n')) {
        const t = line.trim(); if (!t || t.startsWith('#')) continue;
        const [from, to, status] = t.split(/\s+/);
        const re = new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[A-Za-z_]+/g, '[^/]+') + '$');
        if (re.test(p)) return { serveIndex: /^\/(index\.html)?$/.test(to) && (!status || status.startsWith('200')), rule: `public/_redirects ${t}` };
      }
    }
    const toml = path.join(repoDir, 'netlify.toml');
    if (fs.existsSync(toml)) {
      const blocks = fs.readFileSync(toml, 'utf8').split(/\[\[redirects\]\]/).slice(1);
      for (const b of blocks) {
        const from = (b.match(/from\s*=\s*"([^"]+)"/) || [])[1];
        const to = (b.match(/to\s*=\s*"([^"]+)"/) || [])[1];
        const status = (b.match(/status\s*=\s*(\d+)/) || [])[1];
        if (!from || !to) continue;
        const re = new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        if (re.test(p)) return { serveIndex: /^\/(index\.html)?$/.test(to) && (!status || status === '200'), rule: `netlify.toml ${from} -> ${to} ${status || ''}` };
      }
    }
    return { serveIndex: false, rule: 'no matching Netlify redirect in the publish directory' };
  }
  return { serveIndex: false, rule: 'unknown host' };
}

export async function startHostSim({ origin, repoDir, host, port, logFile }) {
  const cache = new Map();
  const log = (o) => { if (logFile) fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n'); };
  async function upstream(p) {
    if (cache.has(p)) return cache.get(p);
    const r = await fetch(origin.replace(/\/$/, '') + p, { headers: { 'user-agent': 'Mozilla/5.0 hostsim' } });
    const body = Buffer.from(await r.arrayBuffer());
    const v = { status: r.status, type: r.headers.get('content-type') || 'application/octet-stream', body };
    if (r.status === 200) cache.set(p, v);
    return v;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const send = (status, type, body, why) => { log({ path: p, status, why }); res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
      if (p === '/' || p === '/index.html') { const u = await upstream('/'); return send(u.status, 'text/html; charset=utf-8', u.body, 'index from live deployment'); }
      const pub = path.join(repoDir, 'public', p);
      if (pub.startsWith(path.join(repoDir, 'public')) && path.basename(p) !== '_redirects' && fs.existsSync(pub) && fs.statSync(pub).isFile())
        return send(200, TYPES[path.extname(p)] || 'application/octet-stream', fs.readFileSync(pub), 'file from repo public/');
      if (/\.[A-Za-z0-9]{1,6}$/.test(p)) { const u = await upstream(p); return send(u.status, u.type, u.body, 'asset from live deployment'); }
      const d = routeDecision(host, repoDir, p);
      if (d.serveIndex) { const u = await upstream('/'); return send(200, 'text/html; charset=utf-8', u.body, d.rule); }
      const body = host === 'vercel'
        ? '<!doctype html><title>404: NOT_FOUND</title><h1>404: NOT_FOUND</h1><p>Code: NOT_FOUND</p><p>The page could not be found.</p>'
        : '<!doctype html><title>Page not found</title><h1>Page not found</h1><p>Looks like you have followed a broken link or entered a URL that does not exist on this site.</p>';
      return send(404, 'text/html; charset=utf-8', body, d.rule);
    } catch (e) { res.writeHead(502); res.end(String(e)); }
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => server.close(ok)) };
}
