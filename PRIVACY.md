# stepkeeper Privacy Policy

Last updated: 2026-07-16

stepkeeper is a browser extension that turns YouTube how-to videos into documents. It is designed to run entirely on your machine, using your own Google Gemini API key.

## What the extension stores

- **Your Gemini API key and settings** (output language, model, optional server URL) are stored in Chrome's extension storage (`chrome.storage.sync`) on your browser/Google profile. They are never sent to the extension authors.

## What the extension sends, and to whom

- When you run an analysis, the extension sends the **YouTube video URL, video duration, and analysis prompt** to the **Google Gemini API** (`generativelanguage.googleapis.com`), authenticated with **your own API key**. Google processes this request under its own terms and privacy policy.
- If you configure an optional stepkeeper-server URL, the same request goes to **that server of your choosing** instead.
- Nothing else is transmitted anywhere. There are no analytics, no tracking, no telemetry, and no data collection by the extension authors.

## What stays local

- Captured video frames, your frame selections, and generated documents are created in your browser and saved only as local downloads.

## Permissions

- `storage` — save your settings.
- `generativelanguage.googleapis.com` — call the Gemini API with your key.
- Content script on `youtube.com/watch` — draw the UI and capture frames from the video player you are watching.

## Contact

Open an issue at https://github.com/zlej123/stepkeeper-extension/issues
