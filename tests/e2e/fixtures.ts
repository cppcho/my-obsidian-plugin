import { test as base, chromium, type Browser, type Page } from "@playwright/test";
import { mkdtemp, mkdir, cp, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLUGIN_ID = "my-obsidian-plugin";
const OBSIDIAN_BIN =
	process.env.OBSIDIAN_BIN ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const CDP_PORT = Number(process.env.OBSIDIAN_CDP_PORT ?? 9222);

interface ObsidianFixture {
	browser: Browser;
	window: Page;
	vaultDir: string;
	process: ChildProcess;
}

async function waitForCdp(port: number, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (res.ok) return;
		} catch {
			// not yet
		}
		await sleep(250);
	}
	throw new Error(`CDP did not come up on port ${port} within ${timeoutMs}ms`);
}

async function dumpFailureArtifacts(window: Page, name: string): Promise<void> {
	const dir = path.join(REPO_ROOT, "test-results");
	await mkdir(dir, { recursive: true });
	await window.screenshot({ path: path.join(dir, `${name}.png`) }).catch(() => {});
	const html = await window.content().catch(() => "<unavailable>");
	await writeFile(path.join(dir, `${name}.html`), html).catch(() => {});
}

export const test = base.extend<{ obsidian: ObsidianFixture }>({
	// eslint-disable-next-line no-empty-pattern
	obsidian: async ({}, use) => {
		const userDataDir = await mkdtemp(path.join(tmpdir(), "obs-userdata-"));
		const vaultDir = await mkdtemp(path.join(tmpdir(), "obs-vault-"));

		await cp(path.join(__dirname, "test-vault-template"), vaultDir, { recursive: true });

		const pluginDir = path.join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
		await mkdir(pluginDir, { recursive: true });
		for (const f of ["main.js", "manifest.json", "styles.css"]) {
			const src = path.join(REPO_ROOT, f);
			await stat(src);
			await cp(src, path.join(pluginDir, f));
		}

		// Pre-register the test vault as opened so Obsidian skips the vault picker.
		const obsidianConfig = {
			vaults: { testvault: { path: vaultDir, ts: Date.now(), open: true } },
		};
		await writeFile(path.join(userDataDir, "obsidian.json"), JSON.stringify(obsidianConfig));

		// Spawn Obsidian directly (rather than via _electron.launch) so we can
		// guarantee --remote-debugging-port is honored. Some Obsidian builds drop
		// the auto-injected debug flag from Playwright's _electron.launch path.
		const proc = spawn(
			OBSIDIAN_BIN,
			[`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${CDP_PORT}`],
			{ stdio: ["ignore", "ignore", "ignore"], detached: false },
		);

		await waitForCdp(CDP_PORT);

		const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
		const context = browser.contexts()[0] ?? (await browser.newContext());
		let window =
			context.pages().find((p) => /^app:|^obsidian:|^file:/i.test(p.url())) ?? context.pages()[0];
		if (!window) {
			window = await context.waitForEvent("page", { timeout: 10_000 });
		}
		await window.waitForLoadState("domcontentloaded");

		try {
			await window.waitForSelector(".workspace", { timeout: 30_000 });
		} catch (err) {
			await dumpFailureArtifacts(window, "workspace-timeout");
			throw err;
		}

		// New vaults launch in Restricted Mode (community plugins disabled). Drop
		// the modal, turn off restricted mode, load our plugin, and enable any
		// core plugins our tests rely on (daily-notes for the timestamp command).
		await window.evaluate(async (id) => {
			const w = globalThis as unknown as {
				app: {
					plugins: {
						setEnable?: (enabled: boolean) => Promise<void>;
						enablePlugin?: (id: string) => Promise<void>;
						loadPlugin?: (id: string) => Promise<void>;
					};
					internalPlugins?: {
						getPluginById?: (id: string) => { enable?: () => Promise<void>; enabled?: boolean } | null;
					};
				};
			};
			document
				.querySelectorAll(".modal-close-button")
				.forEach((el) => (el as HTMLElement).click());
			if (w.app.plugins.setEnable) await w.app.plugins.setEnable(true);
			if (w.app.plugins.enablePlugin) await w.app.plugins.enablePlugin(id);
			else if (w.app.plugins.loadPlugin) await w.app.plugins.loadPlugin(id);

			const dn = w.app.internalPlugins?.getPluginById?.("daily-notes");
			if (dn && !dn.enabled && dn.enable) await dn.enable();
		}, PLUGIN_ID);

		try {
			await window.waitForFunction(
				(id) => {
					const w = globalThis as unknown as {
						app?: { plugins?: { plugins?: Record<string, unknown> } };
					};
					return Boolean(w.app?.plugins?.plugins?.[id]);
				},
				PLUGIN_ID,
				{ timeout: 15_000 },
			);
		} catch (err) {
			await dumpFailureArtifacts(window, "plugin-load-timeout");
			throw err;
		}

		await use({ browser, window, vaultDir, process: proc });

		await browser.close().catch(() => {});
		proc.kill("SIGTERM");
		// Obsidian sometimes lingers — force-kill if SIGTERM didn't take after 2s.
		const exited = await Promise.race([
			new Promise<boolean>((resolve) => proc.once("exit", () => resolve(true))),
			sleep(2_000).then(() => false),
		]);
		if (!exited) {
			proc.kill("SIGKILL");
			await Promise.race([
				new Promise<void>((resolve) => proc.once("exit", () => resolve())),
				sleep(2_000),
			]);
		}
		await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
		await rm(vaultDir, { recursive: true, force: true }).catch(() => {});
	},
});

export { expect } from "@playwright/test";
