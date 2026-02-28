# My Obsidian Plugin

A personal Obsidian plugin for daily timestamped note-taking.

## Features

### Daily Timestamp

Command: **"Insert or navigate to timestamp"**

Opens today's daily note at `daily/YYYY-MM-DD.md` and creates or navigates to a timestamp heading for the current time. Configurable via settings:

- **Heading level** — H1 through H6 (default: H3)
- **Cursor placement** — on the heading line or on an empty line below
- **Vim insert mode** — automatically enter insert mode after navigation (requires Obsidian vim mode)

## Installation

Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/my-obsidian-plugin/`, then enable the plugin in Obsidian settings.

## Development

```bash
pnpm install          # install dependencies
pnpm run dev          # watch mode
pnpm run build        # production build (typecheck + esbuild)
pnpm run lint         # eslint
pnpm run test         # run tests
pnpm run test:watch   # run tests in watch mode
```
