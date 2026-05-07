import { App, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, moment } from "obsidian";
import { EditorView } from "@codemirror/view";
import { appHasDailyNotesPluginLoaded, getAllDailyNotes, getDailyNote, createDailyNote } from "obsidian-daily-notes-interface";
import { insertOrNavigateTimestamp, computeScrolloffScroll, TimestampSettings } from "./editor-utils";
import { getOrCreateDailyNote } from "./daily-note-utils";
import { FRAGMENTS_FOLDER, getFragmentTargetPath } from "./move-utils";
import { findHeadingLinkedSections, HeadingInfo, LinkedSection, SourceFileInfo } from "./linked-content";
import { renderLinkedSections } from "./linked-content-render";

const DEFAULT_SETTINGS: TimestampSettings = {
	headingLevel: 3,
	cursorOnEmptyLine: false,
	vimInsertMode: false,
	scrolloffLines: 0,
	showLinkedContent: true,
};

const LINKED_NOTES_CLASS = "my-plugin-linked-notes";

function enterVimInsertMode(app: App) {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- undocumented Obsidian API
	if (!(app.vault as any).getConfig("vimMode")) return;
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- undocumented Obsidian API
	const cm = (view.editor as any).cm;
	if (!cm) return;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- undocumented Obsidian API
	cm.contentDOM.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "i",
			code: "KeyI",
			bubbles: true,
			cancelable: true,
		}),
	);
}

class DailyTimestampSettingTab extends PluginSettingTab {
	plugin: DailyTimestampPlugin;

	constructor(app: App, plugin: DailyTimestampPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Heading level")
			.setDesc("Choose the heading level for timestamp entries (H1-H6)") // eslint-disable-line obsidianmd/ui/sentence-case
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						"1": "H1",
						"2": "H2",
						"3": "H3",
						"4": "H4",
						"5": "H5",
						"6": "H6",
					})
					.setValue(String(this.plugin.settings.headingLevel))
					.onChange(async (value) => {
						this.plugin.settings.headingLevel = parseInt(value);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Cursor on empty line below heading")
			.setDesc("When enabled, cursor is placed on an empty line below the heading instead of on the heading line")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.cursorOnEmptyLine)
					.onChange(async (value) => {
						this.plugin.settings.cursorOnEmptyLine = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enter vim insert mode")
			.setDesc("When enabled, automatically enter insert mode after navigation (requires vim mode)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.vimInsertMode)
					.onChange(async (value) => {
						this.plugin.settings.vimInsertMode = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Bottom scrolloff lines")
			.setDesc("Keep this many lines visible below the cursor when it nears the bottom of the editor (0 to disable)")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.scrolloffLines))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						this.plugin.settings.scrolloffLines = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show heading-linked content in reading view")
			.setDesc("Append a list of source notes whose heading line contains a link to the current file")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLinkedContent)
					.onChange(async (value) => {
						this.plugin.settings.showLinkedContent = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

export default class DailyTimestampPlugin extends Plugin {
	settings: TimestampSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DailyTimestampSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on("create", (file) => {
					void this.moveToFragmentsIfDated(file);
				}),
			);
			this.registerEvent(
				this.app.vault.on("rename", (file) => {
					void this.moveToFragmentsIfDated(file);
				}),
			);
		});

		this.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				if (!update.selectionSet && !update.docChanged) return;
				const lines = this.settings.scrolloffLines;
				if (lines <= 0) return;
				const view = update.view;
				const head = update.state.selection.main.head;
				const coords = view.coordsAtPos(head);
				if (!coords) return;
				const scrollDOM = view.scrollDOM;
				const scrollTop = scrollDOM.scrollTop;
				// coordsAtPos returns viewport-relative pixels; convert to document-relative.
				const rect = scrollDOM.getBoundingClientRect();
				const cursorTop = coords.top - rect.top + scrollTop;
				const cursorBottom = coords.bottom - rect.top + scrollTop;
				const target = computeScrolloffScroll({
					cursorTop,
					cursorBottom,
					scrollTop,
					clientHeight: scrollDOM.clientHeight,
					lineHeight: view.defaultLineHeight,
					scrolloffLines: lines,
				});
				if (target === null) return;
				scrollDOM.scrollTop = target;
			}),
		);

		this.addCommand({
			id: "move-dated-files-to-fragments",
			name: "Move dated files to fragments/",
			callback: async () => {
				let moved = 0;
				for (const file of this.app.vault.getFiles()) {
					if (await this.moveToFragmentsIfDated(file)) moved++;
				}
				new Notice(moved === 0 ? "No dated files to move." : `Moved ${moved} file(s) to fragments/.`);
			},
		});

		this.addCommand({
			id: "insert-or-navigate-timestamp",
			name: "Insert or navigate to timestamp",
			callback: async () => {
				const now = new Date();
				const adapter = { appHasDailyNotesPluginLoaded, getAllDailyNotes, getDailyNote, createDailyNote };
				const file = await getOrCreateDailyNote(adapter, moment());
				if (!file) {
					new Notice("Enable the Daily Notes core plugin to use this command."); // eslint-disable-line obsidianmd/ui/sentence-case
					return;
				}
				const dailyPath = file.path;

				const activeFile = this.app.workspace.getActiveFile();
				const alreadyOpen = activeFile?.path === dailyPath;

				if (!alreadyOpen) {
					const leaf = this.app.workspace
						.getLeavesOfType("markdown")
						.find((l) => l.view instanceof MarkdownView && l.view.file?.path === dailyPath);

					if (leaf) {
						this.app.workspace.setActiveLeaf(leaf, { focus: true });
					} else {
						await this.app.workspace.getLeaf(false).openFile(file);
					}
				}

				setTimeout(() => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						const vimFn = this.settings.vimInsertMode ? () => enterVimInsertMode(this.app) : undefined;
						insertOrNavigateTimestamp(view.editor, vimFn, this.settings, now);
					}
				}, alreadyOpen ? 0 : 100);
			},
		});

		this.registerMarkdownPostProcessor((el, ctx) => this.injectLinkedContent(el, ctx));

		this.registerEvent(
			this.app.metadataCache.on("changed", (changedFile) => this.handleMetadataChange(changedFile)),
		);

		this.registerEvent(this.app.workspace.on("file-open", () => this.refreshAllLinkedContent()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshAllLinkedContent()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshAllLinkedContent()));
		// On cold startup the metadata cache may not be populated yet; refresh once it resolves.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				if (this.cacheResolvedOnce) return;
				this.cacheResolvedOnce = true;
				this.refreshAllLinkedContent();
			}),
		);
		this.app.workspace.onLayoutReady(() => this.refreshAllLinkedContent());
	}

	private cacheResolvedOnce = false;
	private viewChildren = new WeakMap<MarkdownView, MarkdownRenderChild>();

	private refreshAllLinkedContent(force = false): void {
		if (!this.settings.showLinkedContent) return;
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) continue;
			void this.injectLinkedContentForView(leaf.view, force);
		}
	}

	private async injectLinkedContentForView(view: MarkdownView, force = false): Promise<void> {
		const file = view.file;
		if (!file) return;

		const isPreview = view.getMode() === "preview";
		const host = isPreview
			? (view.containerEl.querySelector(".markdown-preview-view .markdown-preview-section") as HTMLElement | null)
			: (view.containerEl.querySelector(".markdown-source-view .cm-sizer") as HTMLElement | null);
		if (!host) return;

		const existing = host.querySelector(`:scope > .${LINKED_NOTES_CLASS}`) as HTMLElement | null;
		if (existing) {
			if (!force && existing.dataset.targetPath === file.path) return;
			const prev = this.viewChildren.get(view);
			if (prev) {
				view.removeChild(prev);
				this.viewChildren.delete(view);
			}
			existing.remove();
		}

		// Claim the wrapper slot synchronously before any await so concurrent
		// invocations see the existing wrapper and skip.
		const wrapper = host.ownerDocument.createElement("div");
		wrapper.className = LINKED_NOTES_CLASS;
		wrapper.dataset.targetPath = file.path;
		if (isPreview) {
			// Insert before the reading-mode footer; Obsidian re-asserts the footer
			// as the last child, so appending after it gets yanked.
			const footer = host.querySelector(":scope > .mod-footer");
			if (footer) host.insertBefore(wrapper, footer);
			else host.appendChild(wrapper);
		} else {
			host.appendChild(wrapper);
		}

		const items = await this.collectLinkedSections(file);
		if (!wrapper.isConnected) return;
		if (items.length === 0) {
			wrapper.remove();
			return;
		}

		const child = new MarkdownRenderChild(wrapper);
		view.addChild(child);
		this.viewChildren.set(view, child);

		await renderLinkedSections(wrapper, items, async (md, target) => {
			await MarkdownRenderer.render(this.app, md, target, file.path, child);
		});
	}

	private findViewForPath(path: string, mode: "preview" | "source"): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) continue;
			if (leaf.view.file?.path !== path) continue;
			const isPreview = leaf.view.getMode() === "preview";
			if (mode === "preview" && !isPreview) continue;
			if (mode === "source" && isPreview) continue;
			return leaf.view;
		}
		return null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as TimestampSettings | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async moveToFragmentsIfDated(file: TAbstractFile): Promise<boolean> {
		if (!(file instanceof TFile)) return false;
		const target = getFragmentTargetPath(file.path);
		if (!target || target === file.path) return false;
		if (this.app.vault.getAbstractFileByPath(target)) return false;

		const folder = this.app.vault.getAbstractFileByPath(FRAGMENTS_FOLDER);
		if (!folder) {
			await this.app.vault.createFolder(FRAGMENTS_FOLDER);
		} else if (!(folder instanceof TFolder)) {
			return false;
		}

		try {
			await this.app.fileManager.renameFile(file, target);
			return true;
		} catch (err) {
			console.error(`Failed to move ${file.path} to ${target}`, err);
			return false;
		}
	}

	private injectLinkedContent(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		if (!this.settings.showLinkedContent) return;
		// Skip embeds and hover popovers — only run inside the top-level reading view.
		if (el.closest(".markdown-embed") || el.closest(".popover")) return;
		// Skip content rendered inside our own wrapper (MarkdownRenderer.render fans out
		// the post-processor recursively for the section bodies we render).
		if (el.closest(`.${LINKED_NOTES_CLASS}`)) return;

		// The post-processor runs before `el` is attached to the document. Defer to
		// the next tick so we can find the matching MarkdownView and inject.
		setTimeout(() => {
			const view = this.findViewForPath(ctx.sourcePath, "preview");
			if (view) void this.injectLinkedContentForView(view);
		}, 0);
	}

	private async collectLinkedSections(targetFile: TFile): Promise<LinkedSection[]> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- getBacklinksForFile is undocumented
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(targetFile) as { data?: Map<string, BacklinkRefRaw[]> | Record<string, BacklinkRefRaw[]> } | undefined;
		if (!backlinks?.data) return [];

		const entries: Array<[string, BacklinkRefRaw[]]> = backlinks.data instanceof Map
			? Array.from(backlinks.data.entries())
			: Object.entries(backlinks.data);

		const sources: SourceFileInfo[] = [];
		for (const [sourcePath, refs] of entries) {
			if (!refs || refs.length === 0) continue;
			const sourceFile = this.app.vault.getFileByPath(sourcePath);
			if (!sourceFile) continue;
			const fileCache = this.app.metadataCache.getFileCache(sourceFile);
			if (!fileCache?.headings || fileCache.headings.length === 0) continue;
			const headings: HeadingInfo[] = fileCache.headings.map((h) => ({
				heading: h.heading,
				level: h.level,
				line: h.position.start.line,
			}));
			const content = await this.app.vault.cachedRead(sourceFile);
			sources.push({
				path: sourcePath,
				basename: sourceFile.basename,
				content,
				headings,
				refs: refs.map((r) => ({ position: { start: { line: r.position.start.line } } })),
			});
		}

		return findHeadingLinkedSections(targetFile.path, sources);
	}

	private handleMetadataChange(changedFile: TFile): void {
		if (!this.settings.showLinkedContent) return;
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) continue;
			const file = leaf.view.file;
			if (!file || file.path === changedFile.path) continue;
			if (!this.hasHeadingLinkTo(changedFile, file.path)) continue;
			void this.injectLinkedContentForView(leaf.view, true);
		}
	}

	private hasHeadingLinkTo(source: TFile, targetPath: string): boolean {
		const cache = this.app.metadataCache.getFileCache(source);
		if (!cache?.links || !cache.headings) return false;
		const headingLines = new Set(cache.headings.map((h) => h.position.start.line));
		for (const link of cache.links) {
			if (!headingLines.has(link.position.start.line)) continue;
			const linktext = link.link.split("#")[0]?.split("|")[0] ?? "";
			const dest = this.app.metadataCache.getFirstLinkpathDest(linktext, source.path);
			if (dest?.path === targetPath) return true;
		}
		return false;
	}
}

interface BacklinkRefRaw {
	position: { start: { line: number } };
}
