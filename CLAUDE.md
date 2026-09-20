# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repo. This file is written
for whoever picks this up next — it assumes you have not read the prior conversation.

**Read `README.md` first** for what this project is, its layout, and how to run it.
**Read `HANDOFF.md`** for the previous pass's notes, but treat it as stale — it predates
everything below and no longer accurately describes the chat provider, the portrait
source, or the image pipeline. Nothing has been done to reconcile the two; that's a good
first task if you want one.

**No spoilers.** This is a narrative mystery game ("Found"). If you're asked to debug or
extend something, you'll likely read story content (transcripts, character system prompts,
mail threads) along the way — that's fine for diagnosis, but don't quote or summarize plot
content back to whoever you're talking to unless they've made clear they already know it or
explicitly want it. Technical descriptions ("this recording has speech, this one doesn't")
are fine; character names, events and revelations are not.

## Running things

```bash
npm run typecheck                                                # tsc, both tsconfigs
npm run build                                                    # build:web + build:electron
LLM_PROVIDER=mock FOUND_FAST_REPLIES=1 npx next dev web -p 4127   # terminal 1
npm test                                                          # terminal 2 (needs the dev server up)
```

`npm test` runs `tests/api.test.mjs` and `tests/story.test.mjs` against the dev server on
port 4127. It does **not** start the server itself — if you see `ECONNREFUSED`, that's why.

`npm run play` builds and runs the packaged-style standalone server + Electron, and is the
closest thing to "what the player actually sees." Use it for anything UI-shaped; typecheck
and the test suite catch correctness, not whether a screen looks right.

### Windows/Git Bash path gotcha
Node (real Windows node, not the Git Bash POSIX layer) does not understand `/tmp/...` paths
written by `curl -o` or similar inside this Bash tool — they resolve to `C:\tmp\...` and
fail with ENOENT. Write scratch files to the scratchpad directory (or anywhere under
`C:\Users\...`) with forward slashes, not `/tmp`.

### Killing your own test runs
Playwright/Electron test scripts (anything under `tests/e2e/` or ad hoc ones you write) can
leave `node.exe`/`electron.exe` processes running after the script exits, even after
`app.close()`. These hold a lock on `data/state.sqlite*`, so deleting it to reset local
state fails with "Device or resource busy." If that happens: `tasklist //FI "IMAGENAME eq
node.exe"` / `electron.exe`, `taskkill //F //PID <pid>` the strays, then delete the sqlite
files. `data/` is gitignored — deleting it is always safe, it's just the local play-session
database and never contains anything that needs to survive.

### Playwright click() was unreliable against this app, in this environment
While testing Settings toggles, `locator.click()` (and even raw `page.mouse.click()` at
computed coordinates) did not register — not just on new code, but on a toggle (Wi-Fi) that
the project's own passing test suite proves works. Don't take a Playwright click failure
here as proof a control is broken; verify by reading the code path (does the setting get
read anywhere?) or by hitting the underlying API directly, the way `tests/api.test.mjs`
does. Screenshots after a *successful* interaction are trustworthy; a script that clicks
and immediately re-reads state to "confirm" a change is not, in this environment.

### next-env.d.ts churns between dev and build
Running `next dev` regenerates `web/next-env.d.ts` to point at `.next/dev/types/...`;
`next build` points it back at `.next/types/...`. It's tracked in git. If `git status` shows
it modified after you've been testing, either `git checkout -- web/next-env.d.ts` or run a
build — don't hand-edit it or commit the dev-mode version.

## What changed in the last session (commit `f3aa254`, "DeepSeek through OpenRouter, real
faces and photos, and no more dead controls")

- **Chat provider**: `web/lib/llm/deepseek.ts` now talks to **OpenRouter**
  (`https://openrouter.ai/api/v1`), not DeepSeek's own API. `DEEPSEEK_API_KEY` must be an
  OpenRouter key (`sk-or-...`). OpenAI and Gemini no longer stand in for chat replies at
  all — they're image/voice-only now. If replies stop working, check this endpoint and key
  first; don't assume the old "needs a platform.deepseek.com key" story from HANDOFF.md.
- **Portraits**: `content/assets/people/*.jpg` are real randomuser.me photos again (fetched
  via `npm run fetch:people` / `scripts/fetch-people.mjs`), gitignored, not committed. If
  they're missing, that's expected on a fresh checkout — the game degrades to silhouettes
  until fetched or generated.
- **Two new filler-content pools**, both fetched from Pixabay and cached under
  `content/assets/generated/filler-{photo,video}/`:
  - `content/filler-photos.json` + `web/lib/fillerPhoto.ts`: junk image files across the
    filesystem (Downloads, Pictures, phone backup, two vacation albums) each pick a real
    photo, categorized by folder, deterministically by path hash. A handful of files with
    self-describing names (`cat.jpg`, `IMG_2210.jpg` in a `Car` folder) are pinned by exact
    path in the `overrides` list instead of hashed.
  - `content/filler-videos.json` + `web/lib/fillerVideo.ts`: junk `.mp4` files play a real
    short clip from a small pool instead of the old ambient-audio-only placeholder.
  - Both need `PIXABAY_API_KEY` (photos) / `PIXABAY_API_KEY_VIDEOS` (videos) in `.env` to
    fetch; without a key they fall back to the pre-existing procedural render (`synthPng`/
    ambient WAV) and nothing breaks, it just looks like it did before.
  - **Pixabay's search ranking is not stable between identical calls.** An `index` field in
    a pool entry is a best-effort nudge, not a guarantee — it picked a different photo on a
    re-fetch during this session. If a pool photo looks wrong, re-run
    `node scripts/fetch-assets.mjs --force` targeting just that file (delete it first) and
    check the result's actual tags via `https://pixabay.com/api/?key=...&id=<id>` before
    trusting it — several first-pass results were confidently wrong (a football stadium for
    a "harbour" wallpaper, Slovakia/France street photos for a "Denver" travel album).
  - Filler photos deliberately avoid images where an identifiable person is the main
    subject (checked by fetching each result's tags and rejecting `portrait`/`woman`/`man`/
    `person`-as-subject hits), consistent with how portraits and OpenAI-image prompts
    already treat "no identifiable people" as a hard rule in this project.
- **Fixed bugs, not just features**: the warm/cool color-cast math in `web/lib/synth.ts`'s
  `synthPng()` was ~3x too weak to ever read as color (this is why generic filler photos
  looked like gray gradients even before the Pixabay swap — check this function if that
  regresses); Settings' Transparency/Animation toggles wrote CSS variables
  (`--shell-blur`, `--anim`, `data-animations`) that no stylesheet consumed; the 24-hour
  clock setting never reached the taskbar clock (`web/lib/client/api.ts` `formatTime` now
  takes a `time24` param); Chrome's own History page capped at 500 rows while the seeded
  backstory alone is ~460 rows, so real play quietly evicted the machine owner's older
  history (`web/lib/browser.ts` `historyVisits` default raised to 20000); `/api/browser`
  double-counted visits for any URL that was both seeded and recently active.
- **Gmail** (`content/sites/mail.google.com/index.html`, a static SPA — there is no React
  component for it, it's served whole by `web/app/sites/[host]/[[...path]]/route.ts`):
  trash restore now works; "Empty Trash now" refuses with a real-sounding reason instead of
  lying that the trash was already empty.
- **Clearing browsing history is now hard-blocked everywhere** (Settings, Chrome's own
  menu, the History page) — `DELETE /api/browser/history` always returns 403. This was
  intentional per this session's request; if a future ask wants it re-enabled, the history
  data model (`web/lib/browser.ts`) no longer has a `clearHistory()` function at all — it
  was deleted as dead code, not just unwired.
- The **`wren` WhatsApp contact** (`content/messaging/contacts.json`) showing a raw phone
  number instead of a name, a "?" avatar, and a permanent `presence: "online"` instead of a
  real last-seen timestamp, is **intentional** — confirmed via `content/triggers.json`,
  which explicitly unlocks that contact and sets its presence in the same trigger effect.
  Don't "fix" this if asked about it again; it already came up once and checked out clean.

## If something looks broken, check these first

- **No one replies to messages**: `DEEPSEEK_API_KEY` in `.env` must be an OpenRouter key.
  `LLM_PROVIDER=mock` bypasses this entirely for testing (see `tests/api.test.mjs`).
- **Images look like gray/dark gradients with no color**: that's the procedural
  `synthPng()` fallback in `web/lib/synth.ts`, active when no Pixabay/OpenAI key is set or
  a specific pool file hasn't been fetched yet. Check `PIXABAY_API_KEY` and whether
  `content/assets/generated/filler-photo/` is populated before assuming the render itself
  regressed.
- **A filler `.mp4` shows a black screen / plays only a hum**: same idea, but for
  `PIXABAY_API_KEY_VIDEOS` and `content/assets/generated/filler-video/`.
- **A Settings toggle "does nothing"**: check whether the setting's value is actually read
  anywhere outside `Settings.tsx` itself (`grep -rn "settings\.<name>"` across
  `web/components` and `web/lib/client/system.tsx`). That's exactly how the
  transparency/animation/24-hour-clock bugs were found — the value was being saved
  correctly and just never consumed.
