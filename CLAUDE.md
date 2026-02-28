# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal Obsidian plugin for daily timestamped note-taking. Provides a single command ("Insert or navigate to timestamp") that opens today's daily note at `daily/YYYY-MM-DD.md` and creates/navigates to a `## HH:MM` heading with the current time. Integrates with Obsidian's vim mode.

## Commands

```bash
pnpm install          # install dependencies
pnpm run dev          # watch mode (rebuilds on change)
pnpm run build        # production build (typecheck + esbuild)
pnpm run lint         # eslint
```

Always use `pnpm run <script>` (the package.json scripts) rather than invoking tools like `tsc` or `node esbuild.config.mjs` directly. Use `pnpm` as the package manager, not `npm` or `npx`.

Build output: `src/main.ts` → `main.js` (esbuild, CJS bundle). The `main.js` and `manifest.json` at repo root are the artifacts Obsidian loads.

## Testing

No test framework. Manual testing only: copy `main.js` + `manifest.json` to `<vault>/.obsidian/plugins/my-obsidian-plugin/`, reload Obsidian, enable the plugin.

## Architecture

Single-file plugin (`src/main.ts`, ~110 lines). No settings, no UI beyond the command.

- `DailyTimestampPlugin.onload()` — registers the command. Opens/switches to the daily note file, then delegates to `insertOrNavigateTimestamp`.
- `insertOrNavigateTimestamp()` — finds the `# YYYY-MM-DD` title heading, finds or inserts a `## HH:MM` heading below it, positions cursor at end of that section.
- `enterVimInsertMode()` — if Obsidian vim mode is enabled, dispatches a keydown event to enter insert mode.
- `findLine()` — regex line search utility.

Daily note conventions: files live at `daily/{YYYY-MM-DD}.md`, first line is `# YYYY-MM-DD`, timestamp sections are `## HH:MM` headings inserted right after the title line.

## Key constraints

- `@ts-ignore` is used for `app.vault.getConfig()` and `editor.cm` — these are undocumented Obsidian internals for vim mode support.
- `isDesktopOnly: false` — must stay mobile-compatible; avoid Node/Electron APIs.
- Command ID `insert-or-navigate-timestamp` is stable; do not rename.
