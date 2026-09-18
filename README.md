# Found

A hidden-computer experience. Double-clicking an unassuming executable
(`recovered_00417.exe`, disguised as a cracked audio plugin) drops you onto
someone else's Windows 11 desktop, filling your screen. It is not your computer.
It belongs to **Wren Castellanos**, a field recordist in Halifax, Nova Scotia —
and it is her whole digital life: Gmail, Google Calendar, WhatsApp, her code, her
terminal history, her secrets. You explore. Over time you learn who she is, what
she recorded, why she copied herself onto strangers' machines, and what she needs
you to do. She can talk back.

This repo is the engine *and* the world. The engine (`web/`, `electron/`) hardcodes
no story; the world is entirely data under `content/`. Swap the content, get a
different person.

## The story, briefly (spoilers)

On a documentary shoot in a care home, Wren recorded a man with dementia
unknowingly confessing to a 1971 killing. His family's lawyer is trying to make her
destroy the tape; someone broke into her apartment. So she packaged her entire
laptop, disguised it, and seeded ~500 copies so the truth could not be erased —
each copy phones a relay once and bridges its WhatsApp back to her real phone. You
have copy #417. Opening the desktop `READ ME.txt` unlocks her. The confession is in
an encrypted archive you must crack from the Terminal (`7z` / `gpg`; the passphrase
is discoverable from her emails and an old newspaper). The story keeps moving after
you arrive: new mail and messages land on a clock and in response to what you read.

## Layout

| Path | Purpose |
| --- | --- |
| `electron/` | The app shell: one fullscreen frameless window, the local content server lifecycle, and the session-level URL intercept for story hosts. |
| `web/` | Next.js app. Serves the desktop UI (`/`), the fake sites (`/sites/<host>/...`), file bodies (`/lf/...`), the audio player (`/player`), Chrome's New Tab Page, and the JSON API. |
| `web/lib/` | Server modules: SQLite state engine + triggers (with time-based `since` conditions), virtual filesystem, messaging, mail, calendar, the PowerShell terminal emulator, DeepSeek client with spend cap, asset manifest, first-run Pexels fetch. |
| `web/components/` | Desktop shell (window manager, taskbar, start menu, context menus, dialogs, notification toasts) and the apps: Explorer, Chrome, WhatsApp, Notepad, **Terminal**. Gmail and Calendar are full HTML apps served as story sites. |
| `content/` | The whole world as data. See `content/README.md`. |
| `scripts/` | Generators (dressing, audio, wallpaper, icons), Pexels fetch, dev runner, packaging hooks. |
| `tests/` | API tests and the Electron end-to-end test (Playwright). |

## Content map

| Path | What it is |
| --- | --- |
| `content/profile.json` | The owner (Wren) and machine identity. |
| `content/characters/*.json` | Per-person LLM config. `_world.md` is the shared brief every character sees; `situations` inject what you've discovered so people "know" what you've read. |
| `content/messaging/` | WhatsApp contacts + seeded history. `wren` is hidden until you open the README. |
| `content/mail/` | The Gmail mailbox: `mailbox.json` (account, labels) + `threads/*.json`. |
| `content/calendar/events.json` | Calendar events, with weekly/daily/monthly recurrence. |
| `content/filesystem/` | `story.json` + `story/*.json` (real, openable files; long bodies in `bodies/`), `story-dressing.json` (extra folders), generated `dressing.json` (unopenable filler). |
| `content/repos/*.json` | Git histories the Terminal replays (`git log`, `git show`, …). |
| `content/terminal/` | `secrets.json` (decryptable archives + passphrase hashes), `ssh.json` (reachable hosts), `scripts.json` (scripted program output). |
| `content/sites/` | Story websites + the Gmail/Calendar single-page clones (`spa: true` in `hosts.json`). |

## Run

```bash
npm install
npm run fetch:people         # profile photos for the cast (randomuser.me, no key needed)
npm run dev                  # Next dev server + Electron pointed at it
```

`npm run dev` creates `.env` for you on first run (copied from `.env.example`) and
tells you so. Paste your API key after `DEEPSEEK_API_KEY=` in it and restart to
give the characters a voice — without it everything else still works, messages just
never get answered. That file is gitignored, so your key stays on your machine.

`fetch:people` makes one request per character and writes
`content/assets/people/*.jpg`; the manifest already points at those paths, so the
faces appear the moment the files exist and fall back to neutral silhouettes until
then. The casting is random per install. Those photos are gitignored so the repo
never redistributes them, but they *are* copied into packaged builds from your
working tree — so run it before `npm run package`. (Drop the two `.gitignore` lines
if you'd rather commit one fixed cast for every build.)

Useful while developing:

- `FOUND_WINDOWED=1 npm run dev` runs in a normal window instead of fullscreen.
- `F12` toggles devtools in dev builds. `Ctrl+Shift+Alt+Q` quits anywhere (also `Alt+F4`).
- `LLM_PROVIDER=mock` makes characters answer with canned text and no network.

## The key (making the world come alive)

Everything is fully explorable with no key at all — every file, email, calendar
day, repo, terminal command and website works offline. The **key** turns the people
on: without it, messages sit on one grey tick and nobody replies; with it, Wren and
her friends answer in character over WhatsApp, and email replies arrive from the
consultant and the victim's daughter.

1. Put a key in `.env` next to the executable (or in the app's data folder):
   `DEEPSEEK_API_KEY=sk-...` (default provider). Any OpenAI-compatible endpoint
   works via `DEEPSEEK_API_BASE` + `LLM_DEFAULT_MODEL`, so you can point it at
   another model later. For **OpenRouter**, set `DEEPSEEK_API_BASE=https://openrouter.ai/api/v1`,
   put your OpenRouter key in `DEEPSEEK_API_KEY`, and use OpenRouter's slugs
   (`deepseek/deepseek-r1`, `deepseek/deepseek-chat`) as the `model` in
   `content/characters/*.json`. Unknown slugs just fall back to the default row in
   `content/llm/pricing.json`, so the spend estimate goes approximate — the hard cap
   still works.
2. `LLM_BUDGET_USD` (default 10) is a hard spend cap for the whole install; when
   reached, characters simply stop reading messages. Every character is set to
   `deepseek-chat` (V3): cheaper than the reasoning models, and it texts in short
   bursts instead of dumping paragraphs.
3. `PEXELS_API_KEY` (optional) fills in stock imagery (wallpaper, backgrounds) on
   first run. Character portraits come from `npm run fetch:people` instead and need
   no key.

So: add the key, download/run, and it starts as a stray file on your machine.

## CI / secrets

`.github/workflows/build.yml` typechecks and builds on every push to `main`. The
Windows `.exe` is a **manual** run (Actions → Build → Run workflow).

The API key is never in the repo — `.env` is gitignored and `.env.example` ships
empty. Add the key once under **Settings → Secrets and variables → Actions**:

| Name | Kind | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Secret | Only read when you tick `bake_key` on a manual run. |
| `DEEPSEEK_API_BASE` | Variable | Optional, e.g. the OpenRouter endpoint. |
| `LLM_DEFAULT_MODEL` | Variable | Optional. |
| `LLM_BUDGET_USD` | Variable | Optional, defaults to 10. |

Ticking `bake_key` writes a `.env` next to the executable in the artifact, so the
build works with no setup by whoever runs it. **That key is then readable by anyone
who has the file** — it is a plain text file sitting beside the exe. Use it for
builds you keep, and give a provider-side spend limit to any key that goes further
than that; the in-app `LLM_BUDGET_USD` cap only limits the app's own spending and
does nothing about a key someone has lifted out of the file.

Leave `bake_key` off and the build ships keyless — each player supplies their own,
which is how the app is designed to work.

## Build and package

```bash
npm run build                # next build (standalone) + electron bundle
npm run package              # Windows portable exe -> release/recovered_00417.exe
npm run package:linux        # unpacked Linux build for smoke testing
```

The portable exe carries the content server, `content/`, and the SQLite runtime.
State lives in the user's AppData folder; `.env` is read from next to the executable
or from that AppData folder. Change the file name and icon in `electron-builder.yml`
(`artifactName`, `executableName`, `build/icon.ico`; `npm run make:icon` regenerates the
icon from the icon library).

Packaging for Windows from Linux needs `wine` for icon embedding; building on Windows
needs nothing extra.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key. Never committed. |
| `LLM_BUDGET_USD` | Hard spend cap for the whole install (default 10). When reached, LLM contacts simply stop reading messages. |
| `LLM_PROVIDER` | `deepseek` (default) or `mock`. |
| `LLM_DEFAULT_MODEL` | Default model when a character does not set one (`deepseek-chat`). Reasoning models read wrong in chat — they answer in paragraphs instead of short bursts. |
| `LLM_TIMEOUT_MS` | Per-request timeout (default 120000). |
| `PEXELS_API_KEY` | For `npm run fetch:assets`. |
| `DATA_DIR`, `CONTENT_DIR` | Overrides for the SQLite folder and content folder (set automatically by Electron). |

## How the pieces fit

**URL intercept.** Browser tabs are `<webview>`s in the `persist:browser` session. In the
main process, `webRequest.onBeforeRequest` redirects any request whose host is listed in
`content/sites/hosts.json` to `http://127.0.0.1:<port>/sites/<host>/<path>` before a
network connection is attempted. The address bar maps those local URLs back to the
story host, so the tab shows `https://placeholder-one.example/`. Every other host goes to
the live internet untouched, with a stock Chrome user agent.

**State engine.** `POST /api/state/events` (and the app itself) records events in SQLite.
After each event every trigger in `content/triggers.json` is evaluated; effects reveal
hidden files, unlock contacts, set flags, or deliver messages. Live changes reach the UI
over an SSE stream at `/api/events`.

**Messaging.** `POST /api/messages/<chat>` stores the message and starts a background
pipeline: delivered tick, DeepSeek request (history window + character system prompt),
read receipt, typing indicator sized to the reply, then the reply. Character configs live
in `content/characters/*.json`; `model` can be swapped per character (`deepseek-chat` is
roughly a third of the price of `deepseek-reasoner`).

**Cost control.** Every call's token usage and estimated cost (prices in
`content/llm/pricing.json`) is logged in `llm_usage`; calls stop at `LLM_BUDGET_USD`.
`GET /api/llm/usage` shows spend. At R1 list prices a typical short exchange costs well
under a cent; the default cap is $10.

**Assets.** `content/assets.json` is the only place image files are named. Stock images
are fetched with `npm run fetch:assets` (Pexels, first result). Person images are
deliberately absent: put files at the paths listed under `people.*` and they show up.

## Tests

```bash
LLM_PROVIDER=mock npx next dev web -p 4127      # in one terminal
npm test                                        # API-level tests
npm run test:e2e                                # boots Electron (wrap in xvfb-run on headless Linux)
node tests/e2e/packaged.mjs release/linux-unpacked/recovered_00417
```

## Deferred (not in this phase)

Task Manager, Settings, Photos, Terminal, Windows Search flyout, notifications,
multiple Chrome windows, downloads, and any story content.
