# Found

A hidden-computer mystery. Double-clicking an unassuming executable drops you onto
someone else's Windows desktop. This repository is the technical shell only: every
piece of story content is placeholder data under `content/`.

## Layout

| Path | Purpose |
| --- | --- |
| `electron/` | The app shell: one fullscreen frameless window, the local content server lifecycle, and the session-level URL intercept for story hosts. |
| `web/` | Next.js app. Serves the desktop UI (`/`), the fake sites (`/sites/<host>/...`), file bodies (`/lf/...`), Chrome's New Tab Page, and the JSON API. |
| `web/lib/` | Server modules: SQLite state engine and triggers, virtual filesystem, messaging + reply pacing, DeepSeek client with spend cap, asset manifest. |
| `web/components/` | Desktop shell (window manager, taskbar, start menu, context menus, dialogs) and the apps: Explorer, Chrome, WhatsApp, Notepad viewer. |
| `content/` | All data. See `content/README.md`. Replace freely; nothing in `web/` or `electron/` hardcodes story. |
| `scripts/` | Generators (dressing files, wallpaper, icons), asset fetching, dev runner, packaging hooks. |
| `tests/` | API tests and Electron end-to-end tests (Playwright). |

## Run

```bash
npm install
cp .env.example .env        # add DEEPSEEK_API_KEY (optional; without it contacts never reply)
npm run dev                  # Next dev server + Electron pointed at it
```

Useful while developing:

- `FOUND_WINDOWED=1 npm run dev` runs in a normal window instead of fullscreen.
- `F12` toggles devtools in dev builds. `Ctrl+Shift+Alt+Q` quits anywhere (also `Alt+F4`).
- `LLM_PROVIDER=mock` makes characters answer with canned text and no network.

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
| `LLM_DEFAULT_MODEL` | Default model when a character does not set one (`deepseek-reasoner`). |
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
