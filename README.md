# GPT TOC Peng

GPT TOC Peng is a Manifest V3 Chrome extension that adds a synchronized,
collapsible table of contents to long ChatGPT answers.

## Features

- Injects only on `chatgpt.com` and `chat.openai.com`.
- Builds a left-side table of contents from assistant answer headings.
- Highlights the current heading while the ChatGPT page scrolls.
- Clicks a heading to jump to it and briefly highlights the target in the answer.
- Collapses to a current-answer heading rail that can preview on hover or stay pinned open.
- Expands the current answer to the configured depth and keeps other answers compact.
- Stores content settings with `chrome.storage.sync` and panel UI state locally.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Load the generated `dist` directory from the Chromium extension management page
with Developer mode enabled. Disable the Chrome Web Store build of GPT Reader
while testing to prevent both content scripts from running on the same page.

## Project history

GPT TOC Peng is based on the open-source
[GPT Reader](https://github.com/lu-shu-ang/gpt-reader) project. The collapsed
heading-rail interaction is inspired by
[PKM-er Floating TOC](https://github.com/pkm-er/obsidian-floating-toc-plugin),
adapted for ChatGPT answer groups and this extension's existing panel.
