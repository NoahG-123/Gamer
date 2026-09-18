# HANDOFF — final build pass (no story details in this file)

## Done
- **Viewer bug, cause 1 (blank text).** Filler text files returned an empty string to the
  editor, so every non-story `.txt`/`.log`/`.ini`/`.md`/`.csv` opened blank. Added
  `web/lib/synthtext.ts`: deterministic, mundane, per-extension bodies. Verified against
  many real files. No file that is blank in the story data was touched (there are none).
- **Viewer bug, cause 2 (real downloads).** Electron's webview had `plugins` disabled, so
  Chromium had no PDF viewer and handed every PDF to the download manager, which wrote to
  the host machine. Fixed by enabling `plugins`, serving every body with an inline
  `content-disposition` and a renderable type, and capturing downloads (see below).
- **Writable filesystem** (`web/lib/fsmut.ts`, `/api/fs/mutate`): save, create, rename,
  delete to the Recycle Bin, restore, empty, copy/paste, all persisted in SQLite over the
  read-only world. Explorer, Notepad, the desktop and the terminal all use it.
- **Settings backend + Settings app**: brightness, volume/mute, Wi-Fi, airplane mode,
  night light, theme, accent, wallpaper (from any picture on the machine), plus real
  About/Network/Apps pages.
- **Quick settings flyout** with working sliders/toggles; **Task Manager** app (real open
  windows, End task works, live graphs); UI sound engine synthesised in the browser so it
  tracks the volume slider.
- **Chrome**: real history page (chrome://history, real visits), downloads page
  (chrome://downloads), working Inspect and View source, Ctrl+H/J/U, and a real offline
  page when Wi-Fi is off (the shell blocks traffic to match).
- **Terminal**: mkdir, New-Item, Set/Add-Content, rm/del (bin, `-Force` permanent),
  mv/ren, cp, and `>` / `>>` redirection now really change the machine.

## Remaining
- Audio: voice content + sound-effect routing (in progress).
- Character/story images.
- Leftover placeholder images (gradient wallpaper fallback + the placeholder story image).
- Messaging: persisted reply scheduling, every contact answering, DeepSeek path verified.
- Final verification (typecheck/tests/e2e), docs, commit, push.

## Environment constraints found
- Blocked by the sandbox proxy: HuggingFace, PyPI package downloads for Chatterbox,
  Freesound, Pixabay, LibriVox, archive.org, Pexels, randomuser.me, api.deepseek.com,
  openrouter.ai. Reachable: Google Generative Language API, npm registry.
- The provided Gemini key has **no image-generation quota** (429, "limit: 0" on every
  image model, both 2.5 and 3.x). Text and TTS work.
- Consequence: sound effects are synthesised locally rather than downloaded; voice audio
  uses Gemini TTS; Chatterbox could not be installed or compared here.

## Functionality audit (categories)
- **Category 1 (built to really work):** window management, Explorer (browse, search,
  sort, tabs, copy/paste/rename/delete/new/properties, Gallery, Recycle Bin with restore
  and empty), Notepad (tabs, save/save-as/open, zoom, word wrap), Terminal (navigation,
  reading, writing, deleting, git replay, ssh, archives, scripted programs), Chrome (tabs,
  omnibox, bookmarks, real internet, story-host intercept, history, downloads, inspect,
  view source, offline state), WhatsApp, Gmail and Calendar clones, quick settings
  (volume, brightness, Wi-Fi, airplane, night light), Settings (display, sound, network,
  personalisation incl. wallpaper/theme/accent, apps, accounts, time, privacy, update),
  Task Manager (processes, End task, performance graphs), notifications and toasts,
  search, task view, widgets, start menu and power menu, file downloads landing in the
  machine's own Downloads folder.
- **Category 2 (genuine technical limits, flat wording, always identical):** Bluetooth
  ("No Bluetooth adapter found."), casting/second display ("No wireless displays found." /
  "No second display detected."), nearby sharing (depends on Bluetooth), printing ("No
  printers or scanners are installed."), camera/microphone/location ("No … is attached to
  this device."), changing the host account password. Each is stated once, mundanely, and
  never changes however many times it is tried.
- **Category 3 (deliberate story locks):** left exactly as the content data defines them —
  they behave like ordinary features and carry no system-level hint. Nothing was added to
  or removed from this set.
