# My Obsidian Plugin

A personal Obsidian plugin with a collection of productivity commands.

## Features

### Daily Timestamp

Command: **"Insert or navigate to timestamp"**

Opens today's daily note at `daily/YYYY-MM-DD.md` and creates or navigates to a `## HH:MM` heading for the current time. Automatically enters insert mode if Obsidian vim mode is enabled.

## Installation

Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/my-obsidian-plugin/`, then enable the plugin in Obsidian settings.

## Development

```bash
pnpm install       # install dependencies
pnpm run dev       # watch mode
pnpm run build     # production build (typecheck + esbuild)
pnpm run lint      # eslint
```
