# f5

**Press refresh on an app someone else shipped.**

AI app builders ship single-page apps that work when you click around and die when you
press F5. The page you were on is a route that only exists in JavaScript, the host has
never heard of it, and the visitor gets `404: NOT_FOUND`. The same thing happens to every
link a user shares.

`f5` runs one check, in the same words, against live apps that strangers built with AI
tools. Kane CLI proves the failure in a real browser. A coding agent fixes the stranger's
repo. Kane runs the same check again, and its verdict only counts if the host's own
request log agrees.

Built for the KaneCLI Online Hackathon, 26 Nov 2026.

## What it found

All numbers below come from files in [`runs/`](runs) and are rebuilt by `node f5.mjs report`
into [`RESULTS.md`](RESULTS.md).

**Sweep, read-only.** 11 live AI-built apps, one real route each (taken from the app's own
router file). 9 were up. **4 of those 9 answer 404 when the page is refreshed.** 2 more
deployments were down entirely.

**Kane proof and fix loop** on three of the four, none of them our code:

| App | Kane on the live site | Agent | Kane after the fix | Host log |
|---|---|---|---|---|
| [Arbab-Mustafa/Payloan](https://github.com/Arbab-Mustafa/Payloan) | failed, `GET /login -> 404` | Codex added `vercel.json` | **passed** | `/login` requested once, 200 |
| [sirmakau/my-financial-compass](https://github.com/sirmakau/my-financial-compass) | failed, `GET /auth -> 404` | Codex added `vercel.json` | **passed** | `/auth` requested once, 200 |
| [thenameisshambhulinga/ERP-Platform-](https://github.com/thenameisshambhulinga/ERP-Platform-) | failed, `GET /login -> 404` | Codex added `vercel.json` twice | **not proven** | `/login` never requested |

The third row is a miss and it stays in the table. That app sends a signed-out visitor
from `/` straight to the login screen, so the check's first line ("the home page loads")
does not fit it. Kane said so in its report three times
([verdict](runs/nido-erp/verdict.json)). The check is frozen, so we did not reword it to
get a green.

**Kane was caught passing a check that had not been fixed.** On the first pass over that
same app, an agent round changed zero files (Claude Code was not logged in, so it did
nothing) and Kane still returned `passed`. The host
log shows the browser never requested `/login` in that run: Kane landed on the login
screen through the app's own redirect and took that as success. That evidence is kept in
[`runs/_kept/nido-false-pass`](runs/_kept/nido-false-pass). It is the reason `f5` now
overrules any Kane pass that the host log cannot back with a 200 for the exact route.

## How the loop works

```
node f5.mjs run payloan
```

1. **Kane, live.** `kane-cli run --agent --headless` gets the frozen check from
   [`checks/refresh.md`](checks/refresh.md) and the live URL. Nothing is written to the
   stranger's site: it opens two pages.
2. **Kane, stand-in.** [`lib/hostsim.mjs`](lib/hostsim.mjs) serves the app on localhost.
   The built bundle comes read-only from the live deployment. The only thing decided
   locally is what the host answers for a path that is not a file, from the routing config
   in the repo clone (`vercel.json`, `public/_redirects`, `netlify.toml`). Kane must fail
   here too, otherwise the stand-in is not faithful and the run stops.
3. **Agent.** Kane's `run_end` report goes into the brief word for word. The agent
   (`claude -p`, then `codex exec`) works in the repo clone. Claude Code gets file tools
   only, no shell. The check lives outside the agent's directory and its SHA-256 is
   recorded before and after every round.
4. **Kane again.** Same check, same words. A fail goes back to the agent as the next
   brief, up to three rounds. A pass is accepted only when the host log shows the route
   was requested during that run and answered 200.
5. **Proof.** `runs/<app>/` holds every Kane NDJSON stream, every brief, every agent
   transcript, the patch per round, the host log and `verdict.json`. `fix.patch` is ready
   to send upstream.

No code from a target repo is installed, built or executed on your machine.

## Run it

Needs Node 20+, `kane-cli` (logged in), and `codex` and/or `claude` on PATH.

```bash
node f5.mjs sweep
```

```bash
node f5.mjs run payloan financial-compass nido-erp
```

```bash
node f5.mjs report
```

`F5_AGENTS=codex,codex` picks the agent order. Add an app by adding a line to
[`targets.json`](targets.json). No Kane account? Every run above is already committed
under `runs/`; open any `verdict.json`.

## Rubric map

| Criterion | Where to look |
|---|---|
| Works end to end | `node f5.mjs run payloan` runs all five steps; recorded output in [`runs/loop.log`](runs/loop.log) |
| Kane caught or proved something | [`runs/payloan/01-kane-live.ndjson`](runs/payloan/01-kane-live.ndjson): failed on a live third-party app, with `network_failure: GET /login -> 404` |
| Agent and Kane talked | [`runs/payloan/03-round2-brief.md`](runs/payloan/03-round2-brief.md) is Kane's report handed to Codex; [`04-round2-kane-recheck.ndjson`](runs/payloan/04-round2-kane-recheck.ndjson) is Kane judging Codex's patch |
| Ships | One file CLI, no dependencies, MIT |
| Verified | Three third-party repos, live proof plus stand-in proof plus host-log witness; one false pass by Kane caught and kept |
| Closed loop | Kane fail -> agent -> Kane recheck -> next brief; the agent cannot edit or see the check |
| Craft | Misses published below and in the table above |

## Limits

- **The fix is not deployed.** We do not own these apps. "Passed" means Kane passed on a
  local stand-in that follows Vercel's documented rule (files first, then `rewrites`).
  The stand-in is checked against reality in one direction only: it must fail the same
  way the live site fails before any fix.
- **No rejected fix yet.** In the committed runs Codex's first patch passed both times.
  The retry path ran only on the app where the check itself did not fit.
- **Claude Code was not logged in** on the machine that produced these runs, so every
  round 1 reads "not logged in, skipped" and Codex did the fixing. The code path for
  `claude -p` is there and untested in a successful round.
- **One check, one route per app.** A pass says that route survives refresh, not that
  the app is sound.
- **Vercel only in the evidence.** Netlify rules are implemented in the stand-in and have
  not been run against a real Netlify app.
- **Small sample.** 11 apps, picked from a GitHub search for Lovable-style repos with a
  live URL. 4 of 9 is not a rate for AI-built apps in general.
- The two fixed apps have not been told. No pull request has been opened.
