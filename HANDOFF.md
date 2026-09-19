# HANDOFF — local pass (contains no story details)

Everything asked for in this pass is done. The build is green: typecheck, **34 API and story
tests**, the **Electron end-to-end test** and `npm run build` all pass.

    npm run typecheck
    npm run build
    LLM_PROVIDER=mock FOUND_FAST_REPLIES=1 npx next dev web -p 4127   # in one terminal
    npm test                                                         # in another
    node tests/e2e/run.mjs                                           # drives the real Electron app

## Providers

**Images: OpenAI only.** Gemini is gone from the image pipeline. `web/lib/images.ts` is the
single place any image is generated, through `gpt-image-1` (override with `IMAGE_MODEL` /
`IMAGE_QUALITY`), asking for JPEG so a file named `.jpg` actually is one. The prompts name a
camera body, a lens, an aperture and an ISO, then ask for the things a real frame has and a
clean render does not — focus landing slightly off, a hand smeared by too slow a shutter,
noise in the shadows, fringing on a bright edge, a colour cast off the walls, framing that
was not composed — because a tidy render reads as a render. Same wording in
`scripts/fetch-people.mjs`, so the script and the first-run path agree.

Gemini is still used in two places that have nothing to do with images, and both were left
alone: `scripts/fetch-voices.mjs` generates the spoken lines, and `web/lib/llm/deepseek.ts`
can fall back to Gemini for replies if an install happens to have a Google key.

**Chat: DeepSeek's own API.** `https://api.deepseek.com` directly, as intended; the
OpenRouter wording is out of `.env`, `.env.example` and the README, kept only as a warning
that an `sk-or-` key will be rejected. When DeepSeek is missing or not answering, replies now
come from **OpenAI** (`LLM_FALLBACK_MODEL`, default `gpt-4.1-mini`), then Gemini, so nobody
goes silent; DeepSeek is still preferred whenever it answers.

**Stock photography: Pexels.** Seven wallpaper presets plus page backgrounds, written to the
data folder rather than the install folder (which is read-only in a packaged build).

## Reachability, now that this is not in a sandbox

| | |
| --- | --- |
| OpenAI, Pexels, HuggingFace, LibriVox, Wikimedia, randomuser.me, pravatar.cc | reachable |
| Freesound, Pixabay | reachable, but both need an API key nobody has supplied |
| api.deepseek.com | reachable; the key in `.env` is an OpenRouter key and is rejected |

**Chatterbox** installs and runs (Python 3.13 venv, torch 2.6 CPU, weights pulled from
HuggingFace). Two notes for anyone repeating it: `resemble-perth` needs `setuptools<81` or its
watermarker silently imports as `None`, and on CPU it generates at about **14.6x slower than
realtime**. It was measured against the shipped clips and **not** adopted — see below.

## Fixed

**A browser tab could ask the host machine for a file.** The world's paths look exactly like
Windows paths, so `file:///C:/Users/<owner>/Desktop/…` handed to Chromium went looking on the
computer the app is running on. Nothing in the story was wrong and no developer path was
hardcoded: the address bar renders a virtual path as `file:///…` (correctly), history and
bookmarks stored that form, and there was no route back. Now there is, twice over — the
renderer maps any `file:` address onto the content server before a tab ever sees it, and the
browser session answers the whole `file:` protocol from the virtual filesystem, so a tab
cannot read this disk even if something slips past. Covered by the end-to-end test.

**Fake sites dropped the player onto the desktop.** A page written the way a real site is —
`href="/"` for its own front page — resolved against the server root and loaded the shell
inside the tab. The site route now scopes every site-owned root-relative link to
`/sites/<host>`, so this is fixed for every site at once, including any added later.

**The profile icon reached a real Google sign-in.** Every Google account domain is now a story
host answered by a local account page, sign-in and OAuth paths under any Google domain are
redirected, and Chromium's account, sync and sign-in-promo features are switched off at the
command line. `gmail.com` answers too, which it did not before.

**Byte-misaligned audio.** A range request starting part-way through a sample rendered from
one byte late, shifting every 16-bit sample — which is a loud harsh buzz, not a recording.
Seeking in a long recording did it every time. The two remaining `f(t)·t` phase bugs (in
`lib/synth.ts` and `scripts/make-audio.mjs`) were fixed the same way `lib/audio.ts` already
was, and the generated files re-rendered. Every sound the machine can make was then rendered
offline and measured: pitch, envelope, clipping and noise floor are all correct.

**Blank documents.** A stray `.docx` had no body at all, and filler PDFs drew grey bars where
text would be — indistinguishable from a viewer that failed to load. Office files now open in
a read-only viewer with deterministic, mundane content (`lib/synthdoc.ts`), and filler PDFs
set real type in Helvetica. Neither file was story content; nothing deliberately blank was
touched.

**Opening an archive in Chrome silently downloaded it.** Chromium refuses to navigate to a
body it decides is a download, leaves the tab where it was, and drops a copy in the download
folder every single time. Archives and installers now get Chrome's own "cannot display this"
page, and the raw-bytes view is served as HTML so it always renders.

**Menu text bled outside its panel.** Long history entries overflowed the rounded background.
The label clips with an ellipsis now; the panel deliberately does not use `overflow: hidden`,
which would clip its own submenus (it has a `backdrop-filter`, so fixed children are contained
by it).

**Favicons were fetched from google.com** by the omnibox, history, bookmarks and the new tab
page — which sent a list of everywhere the player had been to a third party and kept working
while the machine was supposed to be offline. One local endpoint answers them all now.

**Wi-Fi.** The network name is world data (`content/profile.json` → `network`), not a string in
the UI, and Settings, quick settings and the lock screen all read the same one. The toggle
works, and so do Connect/Disconnect against the saved networks.

## Built

- **Settings, audited page by page.** Resolution, scale, night light, output test, the whole
  Network page (saved networks, nearby networks, live properties), transparency, animation,
  text size, lock-screen status, 24-hour clock, per-app Open, clear browsing data. What this
  computer genuinely cannot do (Bluetooth, camera, microphone, printer, second display, a
  password on an account that has none) says so in one flat sentence and says the same thing
  however many times it is asked.
- **Inspect**, as a real docked panel: a live DOM tree, computed styles and attributes, a
  console that evaluates against the page, and a network list. Chromium's own devtools open as
  a separate window, which is invisible behind a fullscreen frameless shell — which is why
  Inspect looked dead. Verified end to end reading 38 nodes out of a real page.
- **Chrome keyboard shortcuts while a page has focus.** A `<webview>` is its own process, so
  the browser chrome never saw Ctrl+T, Ctrl+F or Ctrl+Shift+I once the player clicked into a
  page. They are lifted out of the guest and handed back to the shell.
- **Save as.** Right-click an image, or Ctrl+S a page, and choose a folder on this computer —
  so what you save turns up in File Explorer, in Photos, in search, and in the wallpaper
  picker, rather than only in the browser's download list.
- **Wallpapers** from Pexels instead of gradients, plus anything the player has saved; the same
  picker on the desktop and in Customise Chrome, which is now a real side panel.
- **The calendar is a calendar.** Create, edit, duplicate and delete, with a writable overlay in
  SQLite. A story event is hidden by a tombstone rather than destroyed, so nothing in
  `content/` is ever lost and deleting the row puts it back.
- **Gmail**, audited control by control: the Primary/Promotions/Social tabs really filter (with
  filler mail so they are not empty, and never in Primary), row check boxes, select-all and its
  menu, archive, spam, delete, mark-as-read, the importance marker, drafts that persist, label
  creation, search options, the account and apps menus, and a compose footer that does things.
- **The lock screen** shows live weather, calendar or mail per the setting, and its three corner
  icons open real flyouts — the Wi-Fi one turns this computer's Wi-Fi on and off.
- **Weather and news pictures** on the widgets board, generated by OpenAI and shipped, so they
  are there with no key at all.

## Voices: Chatterbox measured, not adopted

Installed, weights pulled, a line generated and both it and a shipped clip transcribed back —
each came back word-perfect, so intelligibility is a tie. On everything else the shipped clips
win or draw:

- **Noise floor and SNR:** shipped clips -74 dB / 57 dB against Chatterbox's -68 dB / 50 dB.
  Bandwidth is equivalent.
- **Five voices against one.** The recordings use five characters with their own age, accent,
  register and distance from the microphone. Chatterbox is zero-shot: one generic voice unless
  it is given a reference clip to clone per character, and the only reference clips available
  are recordings of real people. Cloning a real reader onto these characters is both wrong and
  a worse match than what is there.
- **Cost:** ~80 minutes of CPU to redo 54 lines, a 3 GB dependency tree, and a dependency that
  is broken out of the box on current Python.

So the audio is unchanged. Freesound and Pixabay would need keys; Wikimedia Commons is
reachable but has no Windows-style interface-sound set, and the synthesised ones measured
clean and follow the volume slider exactly. randomuser.me still works but is no longer used
for portraits — it serves photographs of real people, and generated faces belong to nobody.

## Tests

`tests/story.test.mjs` is new and is the guard against the failure that matters most: a player
staring at something that looks like a puzzle but is actually a bug. It asserts on ids and
paths only, so a failure says what is broken without spoiling what it is.

- Every file, mail, calendar entry, contact and flag a trigger names exists, and no gate waits
  on a flag nothing sets.
- Every encrypted archive is solvable: the file is there, the passphrase hashes, and everything
  it unlocks exists.
- Hint files open with no flags set — a hint locked behind the thing it hints at is the
  definition of unsolvable.
- A live walkthrough: the opening move unlocks what it should, a wrong passphrase is refused
  and unlocks nothing, the right one opens the archive and what it reveals is really there.
- **340 files across the machine are opened and checked for a blank window**, because a blank
  viewer is what makes a player think they have missed a step.
- The commands the hints tell you to type all work.

## Known limits (not code problems)

- `DEEPSEEK_API_KEY` in `.env` is an **OpenRouter** key (`sk-or-v1-…`), which DeepSeek's own API
  rejects with HTTP 401. Nothing in the app can fix that: it needs a key from
  platform.deepseek.com. Until then replies come from the OpenAI stand-in, which works.
- Freesound and Pixabay need API keys.
- There is no NVIDIA GPU here, so any local model runs on CPU.

## Remaining

Nothing outstanding.
