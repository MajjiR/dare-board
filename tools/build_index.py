"""Build INDEX.md and data/index.json: public AI-builder repos with a live URL, checked read-only over HTTP."""
import json, subprocess, datetime, re, concurrent.futures as cf
QUERIES = ['lovable.app in:homepage', 'lovable-tagger', 'topic:lovable', 'built with lovable', 'lovable.dev', 'vite_react_shadcn_ts', 'topic:lovable-dev', 'made with lovable', 'topic:bolt-new', 'topic:v0']
seen = {}
for q in QUERIES:
    r = subprocess.run(['gh', 'search', 'repos', q, '--limit', '100', '--json', 'fullName,homepage,pushedAt'], capture_output=True, text=True)
    try: rows = json.loads(r.stdout or '[]')
    except Exception: rows = []
    for x in rows:
        h = (x.get('homepage') or '').strip().rstrip('/')
        if h and not h.startswith('http'): h = 'https://' + h
        if not re.match(r'https://[A-Za-z0-9.-]+\.[a-z]{2,}(/.*)?$', h or ''): continue
        if re.search(r'github\.com|lovable\.dev|youtube|linkedin|npmjs|docs\.', h): continue
        seen.setdefault(x['fullName'], h)
def code(u):
    try: return int(subprocess.run(['curl', '-s', '-o', '/dev/null', '-m', '10', '-L', '-A', 'Mozilla/5.0 dare-board-index', '-w', '%{http_code}', u], capture_output=True, text=True).stdout or 0)
    except Exception: return 0
def one(item):
    repo, live = item
    h = code(live); d = code(live + '/this-page-does-not-exist-f5') if h == 200 else 0
    v = 'down' if h != 200 else ('host 404 on unknown paths' if d == 404 else 'host serves the app for unknown paths' if d == 200 else 'other')
    return {'repo': repo, 'repo_url': 'https://github.com/' + repo, 'live': live, 'home_status': h, 'unknown_path_status': d, 'verdict': v, 'checked': datetime.datetime.now(datetime.timezone.utc).isoformat()}
with cf.ThreadPoolExecutor(24) as ex: out = list(ex.map(one, sorted(seen.items())))
board = {x['live'].rstrip('/'): x['name'] for x in json.load(open('targets.json'))}
for o in out: o['on_dare_board'] = board.get(o['live'])
json.dump(out, open('data/index.json', 'w'), indent=1)
up = [o for o in out if o['home_status'] == 200]; bad = [o for o in up if o['unknown_path_status'] == 404]
L = ['# Index of live AI-built apps', '',
     f'{len(out)} public repos with a live URL, from GitHub searches for AI-builder projects (queries in [`tools/build_index.py`](tools/build_index.py)). Checked read-only over HTTP: the home page, and one address that cannot exist.', '',
     f'**{len(up)} up, {len(out) - len(up)} down. {len(bad)} of the {len(up)} live apps answer with a host 404 on an unknown path.**', '',
     'What that means: if the app routes its pages in JavaScript, every page except the home page breaks on refresh or as a shared link. For a site with real pages a 404 there is correct, and this check cannot tell the two apart. It is an HTTP check, not a Kane run. The search matches on keywords, so some repos here were not made with an AI builder.', '',
     'Apps marked "on board" can be dared and judged by Kane. Data: [`data/index.json`](data/index.json).', '',
     '| Repo | Live | Home | Unknown path | Verdict | On board |', '|---|---|---|---|---|---|']
for o in sorted(out, key=lambda o: (o['home_status'] != 200, o['unknown_path_status'] != 404, o['repo'].lower())):
    L.append(f"| [{o['repo']}]({o['repo_url']}) | {o['live']} | {o['home_status']} | {o['unknown_path_status'] or '-'} | {o['verdict']} | {o['on_dare_board'] or ''} |")
open('INDEX.md', 'w').write('\n'.join(L) + '\n'); print(L[4])
