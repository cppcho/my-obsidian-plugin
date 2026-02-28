# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal Obsidian plugin for daily timestamped note-taking. Provides a single command ("Insert or navigate to timestamp") that opens today's daily note at `daily/YYYY-MM-DD.md` and creates/navigates to a timestamp heading with the current time. Heading level and behavior are user-configurable via settings.

## Commands

```bash
pnpm install          # install dependencies
pnpm run dev          # watch mode (rebuilds on change)
pnpm run build        # production build (typecheck + esbuild)
pnpm run lint         # eslint
pnpm run test         # run vitest
pnpm run test:watch   # run vitest in watch mode
```

Always use `pnpm run <script>` (the package.json scripts) rather than invoking tools like `tsc` or `node esbuild.config.mjs` directly. Use `pnpm` as the package manager, not `npm` or `npx`.

Build output: `src/main.ts` → `main.js` (esbuild, CJS bundle). The `main.js` and `manifest.json` at repo root are the artifacts Obsidian loads.

## Development workflow

- **Always use red-green TDD.** Write a failing test first (red), then implement the minimum code to make it pass (green), then refactor. Run `pnpm run test` to verify.
- **Always use Context7** to look up Obsidian plugin API best practices before making changes. Query the `/websites/obsidian_md_plugins` library for plugin guidelines, settings patterns, workspace APIs, and vault operations.

## Testing

Unit tests use **vitest**. Test files live alongside source files as `*.test.ts` (e.g., `src/editor-utils.test.ts`). Tests are excluded from the build via `tsconfig.json` and from linting via `eslint.config.mts`.

Core editor logic in `src/editor-utils.ts` is tested via adapter interfaces (`EditorAdapter`) that decouple from the Obsidian runtime. Manual testing: copy `main.js` + `manifest.json` to `<vault>/.obsidian/plugins/my-obsidian-plugin/`, reload Obsidian, enable the plugin.

## Architecture

Two source files:

- **`src/main.ts`** (~140 lines) — Obsidian plugin glue. Registers the command, manages settings, handles file navigation, and provides the vim insert mode function.
  - `DailyTimestampPlugin.onload()` — loads settings, registers the settings tab and command.
  - `DailyTimestampSettingTab` — settings UI (heading level, cursor placement, vim insert mode).
  - `enterVimInsertMode()` — dispatches a keydown event to enter vim insert mode via undocumented Obsidian APIs.

- **`src/editor-utils.ts`** (~80 lines) — Pure editor logic, framework-independent.
  - `insertOrNavigateTimestamp()` — finds or inserts a timestamp heading at the end of the file, positions cursor appropriately.
  - `placeCursorAtHeading()` — shared helper for cursor placement (on heading or empty line below).
  - `findLine()` — regex line search utility.

Settings (`TimestampSettings`): heading level (H1–H6), cursor on empty line below heading, vim insert mode toggle.

Daily note conventions: files live at `daily/{YYYY-MM-DD}.md`, first line is `# YYYY-MM-DD`, timestamp headings are appended at the end of the file.

## Key constraints

- Undocumented Obsidian APIs (`app.vault.getConfig()`, `editor.cm`) use `eslint-disable` comments with `any` casts — not `@ts-ignore`.
- `getLeavesOfType` iterations must use `instanceof` checks on `leaf.view` per Obsidian plugin guidelines.
- `isDesktopOnly: false` — must stay mobile-compatible; avoid Node/Electron APIs.
- Command ID `insert-or-navigate-timestamp` is stable; do not rename.
