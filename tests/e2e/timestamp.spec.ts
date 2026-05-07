import { test, expect } from "./fixtures";

const COMMAND_ID = "my-obsidian-plugin:insert-or-navigate-timestamp";

interface ObsidianAppLite {
	vault: {
		getFileByPath(path: string): { path: string } | null;
		read(file: unknown): Promise<string>;
		cachedRead(file: unknown): Promise<string>;
	};
	commands: { executeCommandById(id: string): Promise<boolean> | boolean };
	workspace: { getActiveFile(): { path: string } | null };
}

async function runCommand(window: import("@playwright/test").Page, id: string): Promise<void> {
	await window.evaluate((cmdId) => {
		const app = (globalThis as unknown as { app: ObsidianAppLite }).app;
		return app.commands.executeCommandById(cmdId);
	}, id);
}

async function readActiveFile(window: import("@playwright/test").Page): Promise<{ path: string; content: string }> {
	return window.evaluate(async () => {
		const app = (globalThis as unknown as {
			app: ObsidianAppLite & {
				workspace: { activeEditor?: { editor?: { getValue(): string } } };
			};
		}).app;
		const f = app.workspace.getActiveFile();
		if (!f) throw new Error("no active file");
		// Prefer the live editor value over vault.read() — editor changes may not
		// have been flushed to disk yet.
		const editorValue = app.workspace.activeEditor?.editor?.getValue();
		const content = editorValue ?? (await app.vault.read(f));
		return { path: f.path, content };
	});
}

test("insert-or-navigate-timestamp opens daily note and appends a timestamp heading", async ({ obsidian }) => {
	const { window } = obsidian;

	const today = new Date().toISOString().slice(0, 10);
	const expectedDailyPath = `daily/${today}.md`;

	await runCommand(window, COMMAND_ID);
	// The command opens the daily file then defers insertion by ~100ms.
	await window.waitForTimeout(800);

	const { path, content } = await readActiveFile(window);
	expect(path).toBe(expectedDailyPath);
	// Default settings render the timestamp at H3.
	expect(content).toMatch(/^### \d{2}:\d{2}\s*$/m);
});

test("re-running the command does not insert a duplicate timestamp", async ({ obsidian }) => {
	const { window } = obsidian;

	await runCommand(window, COMMAND_ID);
	await window.waitForTimeout(400);
	const after1 = await readActiveFile(window);
	const matches1 = after1.content.match(/^### \d{2}:\d{2}\s*$/gm) ?? [];

	await runCommand(window, COMMAND_ID);
	await window.waitForTimeout(400);
	const after2 = await readActiveFile(window);
	const matches2 = after2.content.match(/^### \d{2}:\d{2}\s*$/gm) ?? [];

	// Within the same minute, the second run should navigate to the existing
	// heading rather than appending a new one.
	expect(matches2.length).toBe(matches1.length);
});
