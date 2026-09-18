# HANDOFF — final build pass (contains no story details)

Everything asked for in the final pass is done except the last of the spoken lines, which
are rate-limited by the speech provider (see **Voices** below). The build is green:
typecheck, 16 API tests and the Electron end-to-end test all pass, and `npm run build`
completes.

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
- **Category 2 (genuine limits): 7.** Bluetooth, casting/second display, nearby sharing,
  printing, camera, microphone, host account password. Each states one flat, mundane
  reason ("No Bluetooth adapter found.") and never says anything different however many
  times it is tried. Nothing else uses this wording.
- **Category 3 (story locks): unchanged.** Whatever the content data defines is left
  exactly as it was, behaves like an ordinary feature, and carries no system-level hint.
  Nothing was added to or removed from this set.
- Apps the machine does not actually have were removed from the Start menu and search
  rather than left as dead entries.

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

- The provided Gemini key has **no image-generation quota** (429, "limit: 0", every image
  model, both 2.5 and 3.x), so character photographs could not be generated here. Portraits
  are instead fetched automatically on first run from randomuser.me, which is blocked in
  this sandbox but works on a normal machine.
- Blocked here: HuggingFace (so Chatterbox could not be installed or compared), Freesound,
  Pixabay, LibriVox, archive.org, Pexels, randomuser.me, api.deepseek.com, openrouter.ai.
  Sound effects are therefore synthesised locally, which also keeps them tied to the volume
  slider.
- The DeepSeek path was verified end to end against a local OpenAI-compatible stand-in
  (auth header, model, temperature, token limit, system prompt, history, usage accounting,
  spend cap). Key problems are reported once on the host console, never inside the machine.

## Remaining

Nothing outstanding.
