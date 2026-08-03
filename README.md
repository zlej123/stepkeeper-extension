# stepkeeper-extension

The Chrome extension for [stepkeeper](https://github.com/zlej123/stepkeeper). On a YouTube how-to video, one click:

1. Gemini analyzes the video into steps and visual guides (timestamps for ambiguous phrases),
2. before/center/after candidate frames are captured from the playing player via canvas,
3. you pick one frame per guide, and `document.md` plus the selected images are downloaded.

No server required — you bring your own Gemini key. Nothing is downloaded from YouTube, so there is no yt-dlp and no bot-blocking problem.

## Install

**[Chrome Web Store](https://chromewebstore.google.com/detail/ckgcfpdlfihclbgmigfnniepkeilcgbp)** — one-click install (the store build may trail this repo while updates are in review).

## Install (developer mode)

1. Clone this repo
2. `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select this folder
4. Click the extension icon → enter a Gemini API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey), free, no card required)

## Use

On a watch page, click the **📋 stepkeeper** button (bottom right) → analyze → pick frames → export:

- **Build document** — downloads `document.md` plus the selected images.
- **Open in Obsidian** — creates the note directly in your vault via `obsidian://new` (no API key;
  set the vault name in options, or leave it empty to use the last-opened vault). Selected images
  are downloaded alongside; drop them next to the note to make them show.
- **Copy for Notion** — copies the document as Markdown; paste into any Notion page and the
  formatting converts automatically. Scenes become YouTube timestamp links (paste can't carry
  images; for embedded images use the core CLI's `--target notion`).

- The player seeks around (muted) during capture, then returns to where you were.
- If no candidate fits a guide, choose "unusable"; it becomes a YouTube timestamp link instead.

## Via stepkeeper-server (optional)

Set a server URL in the options to route analysis through [stepkeeper-server](https://github.com/zlej123/stepkeeper-server) instead of calling Gemini directly. Useful for updating prompts without re-shipping the extension.

## skill-core assets

`assets/skill-core/` is a copy of the core repo's prompts and schemas. When the core changes:

```bash
python sync_assets.py ../stepkeeper
```

## Known limits

- `/watch` pages only; Shorts pages are not supported yet.
- Don't capture during ads — you'll get ad frames.
- DRM content blocks canvas capture (normal YouTube videos are unaffected).

## License

MIT
