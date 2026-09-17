# content/

Everything the player can discover lives here as data, not in UI code.
Every file in this directory is currently **PLACEHOLDER** material for the
technical shell. Replace it with real story content without touching `web/`
or `electron/`.

| Path | What it is |
| --- | --- |
| `profile.json` | The computer's owner: username, machine name, time zone, wallpaper, taskbar pins. |
| `filesystem/dressing.json` | Generated, unopenable dressing files (hundreds). Regenerate with `npm run generate:dressing`, or hand-edit. |
| `filesystem/story.json` | The real, content-bearing files. Each entry has a `kind` (`text`, `html`, `image`, `pdf`) and either inline `body` or a `src` relative to `filesystem/assets/`. |
| `filesystem/assets/` | Binary assets referenced by story files (images, PDFs). |
| `messaging/contacts.json` | WhatsApp contacts. A contact with a `character` field is LLM-driven; without it, it only has scripted history. |
| `messaging/history.json` | Pre-existing conversation history per chat, in order. |
| `characters/*.json` | Per-character LLM config: model, system prompt, temperature, reply pacing. |
| `sites/hosts.json` | Story hosts the browser routes to local pages. |
| `sites/<host>/` | Static files for a story site. `index.html` is the root; subfolders map to URL paths. A missing file returns a realistic 404. |
| `browser/bookmarks.json`, `browser/history.json` | Chrome bookmarks bar contents and omnibox history suggestions. |
| `triggers.json` | Story state triggers: when events/flags match, apply effects (reveal file, unlock contact, set flag, deliver message). |
| `llm/pricing.json` | DeepSeek price table used for the spend cap. |

## Tokens

`{user}` inside any path is replaced with `profile.username` at load time.

## Visibility

Any file, contact, bookmark or history entry may carry:

- `"hidden": true` — not shown until a trigger reveals it (`reveal` effect with the same `id`/`path`).
- `"requires": ["flag_name", ...]` — shown only while all listed flags are set.

## Events the engine records

| Event | Subject |
| --- | --- |
| `file.opened` | full path |
| `folder.opened` | full path |
| `app.opened` | app id (`explorer`, `chrome`, `whatsapp`) |
| `site.visited` | host (+ path) |
| `chat.opened` | chat id |
| `message.sent` | chat id |
| `message.received` | chat id |
| `custom` | anything, via `POST /api/state/events` |

See `triggers.json` for the condition/effect grammar.
