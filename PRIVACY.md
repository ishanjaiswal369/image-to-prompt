# Privacy Policy — Image to Prompt

_Last updated: 23 November 2026_

Image to Prompt is a Chrome extension that turns an image you choose into a text-to-image prompt.
This policy explains what data it handles and why.

## What we collect

| Data | When | Why |
| --- | --- | --- |
| Your Google account email and Google account ID | When you sign in with Google | To create your account and keep your credit balance and history |
| The URL of an image you right-click | When you choose "Image to Prompt" on an image | To fetch the image and analyze it; stored with your history |
| A screenshot of the screen region you select | When you use region select | To analyze it. The screenshot is **not stored** — it is sent to the AI model and discarded |
| The generated prompt and its structured fields | After each analysis | To show you your history |
| Credit balance and usage records | On sign-up and each analysis | To track credits |

We do **not** collect browsing history, page contents, keystrokes, location, or any data from pages
you don't explicitly act on.

## How images are analyzed

To generate a prompt, the image is sent to a third-party AI vision model through
[OpenRouter](https://openrouter.ai/privacy) (or Google Gemini, depending on configuration).
Those providers process the image under their own privacy policies. Free models on these
services may log inputs.

## Where data is stored

- On our server's database (hosted Postgres) — account, credits, history.
- In your browser (`chrome.storage.local`) — your sign-in session tokens only.

## Sharing

We do not sell your data, use it for advertising, or share it with anyone except the AI
provider needed to analyze the image you chose.

## Your choices

- Sign out from the extension at any time to clear the session stored in your browser.
- To delete your account and history, open an issue at
  <https://github.com/ishanjaiswal369/image-to-prompt/issues> titled "Delete my data" (do not
  post your email publicly — we'll reach out).

## Chrome Web Store User Data Policy

The use of information received from Google APIs adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## Changes

If this policy changes, the updated version will be posted at this URL with a new date.
