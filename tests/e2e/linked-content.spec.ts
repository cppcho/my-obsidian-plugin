import { test, expect } from "./fixtures";

const DAILY_PATH = "daily/2026-05-07.md";

async function openDaily(window: import("@playwright/test").Page, mode: "preview" | "source"): Promise<void> {
	await window.evaluate(
		async ({ path, mode }) => {
			const app = (globalThis as unknown as { app: ObsidianAppLite }).app;
			const file = app.vault.getFileByPath(path);
			if (!file) throw new Error(`file not found: ${path}`);
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file, { state: { mode } });
		},
		{ path: DAILY_PATH, mode },
	);
}

test("renders heading-linked panel in reading mode with native classes and correct count", async ({ obsidian }) => {
	const { window } = obsidian;
	await openDaily(window, "preview");

	await window.waitForSelector(".markdown-preview-view > .my-plugin-linked-notes", { timeout: 10_000 });
	const wrapper = window.locator(".markdown-preview-view > .my-plugin-linked-notes").first();

	await expect(wrapper).toBeAttached();
	await expect(wrapper).toHaveClass(/search-result-container/);

	// Header chrome: title text + count badge with .tree-item-flair from research.
	await expect(wrapper.locator(".my-plugin-linked-notes-title")).toHaveText("Heading-linked mentions");
	await expect(wrapper.locator(".my-plugin-linked-notes-count")).toHaveText("1");
	await expect(wrapper.locator(".my-plugin-linked-notes-count")).toHaveClass(/tree-item-flair/);

	// One section row per heading-linked mention; native theming classes applied.
	const detailsList = wrapper.locator(":scope > details.tree-item");
	await expect(detailsList).toHaveCount(1);
	await expect(detailsList.first().locator("summary.tree-item-self.is-clickable")).toBeVisible();

	// Summary should contain the source basename and a rendered (not raw) wikilink.
	const summary = detailsList.first().locator(":scope > summary");
	await expect(summary).toContainText("long-source");
	await expect(summary).not.toContainText("[[");
	await expect(summary.locator("a.internal-link")).toBeVisible();
});

test("panel survives virtualized scrolling in reading mode", async ({ obsidian }) => {
	const { window } = obsidian;
	await openDaily(window, "preview");
	await window.waitForSelector(".markdown-preview-view > .my-plugin-linked-notes", { timeout: 10_000 });
	const wrapper = window.locator(".markdown-preview-view > .my-plugin-linked-notes").first();

	for (let i = 0; i < 3; i++) {
		await window.evaluate(() => {
			const preview = document.querySelector(".markdown-preview-view");
			if (preview) preview.scrollTop = 99999;
		});
		await window.waitForTimeout(300);
		await window.evaluate(() => {
			const preview = document.querySelector(".markdown-preview-view");
			if (preview) preview.scrollTop = 0;
		});
		await window.waitForTimeout(300);
	}

	await expect(wrapper).toBeAttached();
	const count = await window.locator(".markdown-preview-view > .my-plugin-linked-notes").count();
	expect(count).toBe(1);
});

test("renders heading-linked panel in source mode", async ({ obsidian }) => {
	const { window } = obsidian;
	await openDaily(window, "source");

	await window.waitForSelector(".markdown-source-view .cm-sizer > .my-plugin-linked-notes", {
		timeout: 10_000,
	});
	const wrapper = window.locator(".markdown-source-view .cm-sizer > .my-plugin-linked-notes").first();

	await expect(wrapper).toBeAttached();
	await expect(wrapper).toHaveClass(/search-result-container/);
	await expect(wrapper.locator(".my-plugin-linked-notes-count")).toHaveText("1");
	await expect(wrapper.locator(":scope > details.tree-item")).toHaveCount(1);
});

interface ObsidianAppLite {
	vault: { getFileByPath(path: string): unknown };
	workspace: {
		getLeaf(newLeaf: boolean): {
			openFile(file: unknown, opts?: { state?: { mode?: string } }): Promise<void>;
		};
	};
}
