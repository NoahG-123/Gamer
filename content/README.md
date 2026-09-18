# content/

The entire world lives here as data. `web/` and `electron/` hardcode no story —
replace this folder and you have a different person's computer.

The current world is **Wren Castellanos**, a field recordist in Halifax. See the
top-level `README.md` for the story and the full content map. Highlights:

| Path | What it is |
| --- | --- |
| `profile.json` | Owner + machine identity (`{user}` expands to `username` everywhere). |
| `characters/_world.md` | Shared brief every LLM character is given. |
| `characters/*.json` | Per-person config. `situations` map story flags → extra prompt text, so people know what you've found. `email` + `emailPrompt` let a character answer mail. |
| `messaging/contacts.json`, `messaging/history.json` | WhatsApp. Hidden contacts (`hidden: true`) appear via an `unlock_contact` trigger. |
| `mail/mailbox.json`, `mail/threads/*.json` | Gmail account, labels, threads. Hidden threads land via `deliver_mail`. Attachments with a `path` open that story file. |
| `calendar/events.json` | Events with `recurrence` {freq, byDay, until, count, exceptions}. Hidden events appear via `reveal_event`. |
| `filesystem/story.json` + `filesystem/story/*.json` | Real, openable files. `kind`: text (Notepad), html/image/pdf/audio (Chrome / player). `bodyFile` loads a long body from `filesystem/bodies/`. `hidden`/`requires` gate visibility. |
| `filesystem/story-dressing.json` | Extra unopenable folders/files (merged with generated `dressing.json`). |
| `repos/*.json` | Git histories the Terminal replays. |
| `terminal/secrets.json` | Decryptable archives: passphrase is sha256 of the phrase lowercased with non-alphanumerics stripped. On success, `outputs` (story paths) are revealed and `flag` set. |
| `terminal/ssh.json`, `terminal/scripts.json` | SSH hosts and scripted program output. |
| `sites/hosts.json`, `sites/<host>/` | Story websites. `spa: true` serves `index.html` for any path (the Gmail/Calendar clones). |
| `browser/*.json`, `triggers.json`, `assets.json`, `llm/pricing.json` | Bookmarks/history, story triggers, image manifest, price table. |

## Triggers

Conditions: `{event, subject?}`, `{flag, value?}`, `{count,…}`, and
`{since:{event|trigger|flag, minutes}}` (time-based — the engine re-checks on a clock
so the world keeps moving while idle), combined with `all`/`any`/`not`.
Effects: `reveal` (file path), `reveal_event`, `unlock_contact`, `deliver_message`,
`deliver_mail`, `set_flag`, `open_app`, `notify` (toast), `presence`, `log`.
