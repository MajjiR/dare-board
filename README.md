# Dare Board

**Dare a live AI-built app to break. Kane CLI is the judge.**

Pick an app that someone shipped with an AI builder. Type, in plain English, how you think
it breaks. Kane CLI opens the live app in a real browser, tries it, and rules: real bug or
not. Real bugs score points on a public leaderboard. For apps with a public repo, a coding
agent takes Kane's report, fixes the repo, and Kane checks the fix.

Built for the KaneCLI Online Hackathon, 26 Nov 2026. None of the apps on the board are ours.

## The index

[`INDEX.md`](INDEX.md) lists every live AI-built app we found, with its repo and a
read-only HTTP check. It is the pool the board draws from. Only 8 of them are on the
board so far, and the index check is plain HTTP, not Kane.

## Run it

Needs Node 20+ and `kane-cli` (logged in). No dependencies to install.

```bash
node dare.mjs serve
```

Open http://127.0.0.1:4600 , enter a name, pick an app, type a dare.

```bash
node dare.mjs house
```

runs the house dares in [`checks/house-dares.json`](checks/house-dares.json) against
every app, as a benchmark.

## How a dare is judged

A dare is a claim that something is broken. Kane is asked to go and see whether the bug
is really there ([`dare.mjs`](dare.mjs), `objective()`):

| Kane's result | Ruling | Points |
|---|---|---|
| Passed: it saw the bug | **Real bug** | 10, plus 5 for the first bug on that app |
| An assertion failed: the bug did not happen | App survived | 0 |
| Timeout, blocked, no result | No ruling | 0 |

Every ruling links to Kane's raw NDJSON run, committed under [`data/kane/`](data/kane).
The board state is [`data/board.json`](data/board.json).

Dares are read-only. Kane is told not to sign in, create accounts, submit data or buy
anything, because these are other people's live sites.

## The fix loop

```bash
node f5.mjs run payloan
```

For a bug the host config can fix, [`f5.mjs`](f5.mjs) closes the loop without building
or running the stranger's code:

1. Kane fails the check on the live site.
2. Kane fails it again on a local stand-in ([`lib/hostsim.mjs`](lib/hostsim.mjs)) that
   serves the live bundle with the routing rules from the repo clone.
3. Kane's report goes to the agent (`claude -p`, then `codex exec`) word for word. The
   agent edits the clone. It cannot see or edit the check.
4. Kane runs the same check again. A pass counts only if the stand-in's request log shows
   the route was requested and answered 200.

Recorded results ([`RESULTS.md`](RESULTS.md), evidence in [`runs/`](runs)):

| App | Kane on the live site | Agent | Kane after the fix |
|---|---|---|---|
| [Arbab-Mustafa/Payloan](https://github.com/Arbab-Mustafa/Payloan) | failed, `GET /login -> 404` | Codex added `vercel.json` | passed |
| [sirmakau/my-financial-compass](https://github.com/sirmakau/my-financial-compass) | failed, `GET /auth -> 404` | Codex added `vercel.json` | passed |
| [thenameisshambhulinga/ERP-Platform-](https://github.com/thenameisshambhulinga/ERP-Platform-) | failed, `GET /login -> 404` | Codex added `vercel.json` | not proven |

**Kane was caught passing a check nobody had fixed.** On the ERP app an agent round
changed zero files and Kane still returned `passed`; the host log shows `/login` was never
requested. Evidence: [`runs/_kept/nido-false-pass`](runs/_kept/nido-false-pass). That is
why step 4 needs the host log to agree.

## Rubric map

| Criterion | Where to look |
|---|---|
| Works end to end | `node dare.mjs serve`, type a dare, get a ruling |
| Kane caught or proved something | [`data/board.json`](data/board.json) rulings; [`runs/payloan/01-kane-live.ndjson`](runs/payloan/01-kane-live.ndjson) |
| Agent and Kane talked | [`runs/payloan/03-round2-brief.md`](runs/payloan/03-round2-brief.md) (Kane's report to Codex) and [`04-round2-kane-recheck.ndjson`](runs/payloan/04-round2-kane-recheck.ndjson) (Kane judging the patch) |

## Limits

- **Runs locally.** The board is not hosted; a public version needs a server that holds a
  Kane login.
- **The dare box and the fix loop are not wired together.** The fix loop is a separate
  command and only handles bugs a host config file can fix. Bugs in app code would need
  the stranger's code built, which this project does not do.
- **Fixes are not deployed.** "Passed" means passed on the local stand-in.
- **Kane can be wrong.** A "real bug" ruling is one Kane run saying it saw the bug. It is
  not replayed, and the false pass above shows the judge makes mistakes.
- **One dare at a time.** Parallel Kane runs were seen landing on each other's pages, so
  the queue runs one browser at a time. A ruling takes about a minute.
- **Claude Code was not logged in** on the machine that made the recorded runs, so Codex
  did every fix.
- **Small board.** 8 apps, found by searching GitHub for AI-builder repos with a live URL.
- The app owners have not been told. No pull request has been opened.
