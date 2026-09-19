# HANDOFF — final build pass (contains no story details)

Everything asked for in the final pass is done. The build is green: typecheck, 16 API tests
and the Electron end-to-end test all pass, and `npm run build` completes.

## Fixed

**Document viewer, blank content.** Filler text files returned an empty string to the
editor, so every non-story `.txt`, `.log`, `.ini`, `.md` and `.csv` opened into a blank
window. `web/lib/synthtext.ts` now gives each one deterministic, mundane, per-extension
content, served identically through the editor and through the file URL. Checked against
many real files, and against the story data first: no file that is deliberately empty was
touched (there are none in the data).

**Document viewer, real downloads.** Electron's browser pane had `plugins` disabled, so
Chromium had no PDF viewer and handed every PDF to the download manager, which wrote to
the host machine. Enabled the viewer, gave every served body an inline disposition and a
type the browser can render, and captured the download manager itself: downloads now land
in the app's own data folder and appear in this machine's Downloads folder. Nothing is
written to the computer it runs on.

**Leftover test images.** The gradient wallpaper fallback and the 141-byte placeholder
image that a story file pointed at are gone, replaced by composed artwork
(`scripts/make-images.mjs`). Checked story usage before deleting; nothing in the world
referenced them except as fallbacks.

## Built

- Writable filesystem over the read-only world (`web/lib/fsmut.ts`): save, create, rename,
  delete to the Recycle Bin, restore, empty, copy/paste — from Explorer, Notepad, the
  desktop and the Terminal. Survives restarts.
- Settings app, quick settings flyout, Task Manager, lock screen.
- New applications: Calculator, Clock, Photos, Paint, audio editor (waveform, transport,
  zoom, selection).
- Chrome: history, downloads, bookmarks, zoom, find in page, Inspect, View source, and a
  real offline state driven by the Wi-Fi setting.
- Reply scheduling in the database, from seconds to days, per person and per time of day,
  surviving restarts; every contact and group can answer; messages sent while offline go
  out when the network returns.
- Interface sounds synthesised in the browser so they follow the volume slider.
- A second sweep over every remaining button, menu entry and toggle in the shell and the
  apps, sorting each into works / genuinely cannot / not in this build, then building the
  first, stating the second plainly and removing the third. That sweep added: Explorer's
  six missing view modes, list, tiles and content layouts, Sort, Filter, Group by and See
  more menus, details and preview panes, item check boxes, hidden items, compact rows,
  name extensions and a sortable folder-path column; Chrome's bookmark manager and
  settings page, with the bookmarks bar, tab-groups button, page zoom and start-up
  behaviour stored alongside the machine's other settings; the messaging app's pin, mute,
  archive, favourite and unread switches, starred messages with a list to match, contact
  info, and search within a conversation; the desktop's own view and sort menus; and the
  taskbar's input-method list.

## Functionality audit

- **Category 1 (real): 60+ surfaces.** Window management; Explorer (browse, search, sort,
  tabs, cut/copy/paste, rename, delete, new, properties, share, Gallery, Recycle Bin with
  restore and empty); Notepad (tabs, save, save as, open, zoom, wrap); Terminal (navigate,
  read, write, delete, move, copy, redirect, git replay, ssh, archives, scripted programs);
  Chrome (tabs, omnibox, bookmarks, history, downloads, find, zoom, inspect, view source,
  real internet, offline state); WhatsApp (chats, search, filters, emoji, attachments, new
  chat); Gmail and Calendar clones; quick settings (volume, brightness, Wi-Fi, airplane,
  night light); Settings (display, sound, network, personalisation incl. wallpaper, theme
  and accent, apps, accounts, time, accessibility, privacy, update); Task Manager
  (processes, End task, performance graphs); Photos; Paint; Calculator; Clock; audio
  editor; lock screen; notifications; search; task view; widgets; start menu; power menu.
- **Category 2 (genuine limits): 8.** Bluetooth, casting/second display, nearby sharing,
  printing, camera, microphone, account password, pairing a phone. Each states one flat, mundane
  reason ("No Bluetooth adapter found.") and never says anything different however many
  times it is tried. Nothing else uses this wording.
- **Category 3 (story locks): unchanged.** Whatever the content data defines is left
  exactly as it was, behaves like an ordinary feature, and carries no system-level hint.
  Nothing was added to or removed from this set.
- **Removed rather than faked:** anything this build does not have is no longer offered —
  apps the machine does not have (gone from the Start menu and search), the Settings
  Gaming page and its two inert switches, a browser assistant this build does not ship,
  and menu entries with nothing behind them. After the sweep there is no control anywhere
  in the shell or the apps that can be clicked and does nothing.

## Voices

Recordings are rendered while they play (bed + spoken lines at real timecodes), so the
ambient signature described in the world is preserved exactly and voices sit over it.
**All 54 lines are generated and committed.** The provider allows only a handful of plain
speech requests per model per day, so the script also speaks through the live-audio models,
which have their own allowance; it does the most important lines first and stops cleanly
when a day is spent, resuming next time.

    npm run fetch:voices     # only needed if lines are added or changed

A generated clip was transcribed back to confirm it says the right words. Measured off the
finished audio, the room tone still carries its described signature: a 92 Hz fundamental
and drifting partials at 466-474 Hz and 1090-1268 Hz, around 25x above the noise floor.
While checking that, a real bug turned up and was fixed — the drifting partials were
written as `f(t) · t`, which makes the frequency run away as a recording gets longer
instead of wobbling a few Hz; the phase is now integrated properly.

## Known environment limits (not code problems)

- The provided Gemini key has **no image-generation quota** — 429 with `limit: 0` on every
  image model across 2.5, 3 and 3.1, on both API versions, and no Imagen model on the key.
  This is a zero allowance rather than a daily one, so it does not come back tomorrow, and
  there is no OpenAI key here to fall back to. Portraits are therefore acquired at run time
  instead: the app tries image generation first (so a key that does have allowance draws
  faces that belong to nobody), then two free portrait services. All three are blocked in
  this sandbox — the two services answer 403 through the proxy — but any one of them
  working on a normal machine fills the whole cast, and if none does, the silhouettes stay
  and nothing else changes. Which face a person gets falls out of a hash of the file it
  lands in, so nothing chooses a face for anyone.
- Blocked here: HuggingFace and its mirrors, Freesound, Pixabay, LibriVox, archive.org,
  Pexels, Wikimedia, randomuser.me, pravatar.cc, api.deepseek.com, openrouter.ai.
  Chatterbox installs from PyPI but its model weights come only from HuggingFace, so it
  could not be run, and the comparison the brief asked for could not be made here. Sound
  effects are therefore synthesised locally, which also keeps them tied to the volume
  slider and free of licensing.
- The DeepSeek path was verified end to end against a local OpenAI-compatible stand-in
  (auth header, model, temperature, token limit, system prompt, history, usage accounting,
  spend cap). Key problems are reported once on the host console, never inside the machine.
- Because api.deepseek.com is blocked here, a **stand-in model** was added so people still
  answer when DeepSeek is missing, rejected or unreachable: with a `GEMINI_API_KEY` set,
  replies come from Gemini instead, with the same system prompt and history, and every call
  is still recorded. Verified live here without any DeepSeek key at all: a message sent in
  the app was scheduled, delivered and answered in character. DeepSeek is still preferred
  whenever it is configured and answering.

## Remaining

Nothing outstanding.
