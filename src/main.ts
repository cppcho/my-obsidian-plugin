import {App, MarkdownView, Plugin, PluginSettingTab, Setting, TFile} from "obsidian";
import {insertOrNavigateTimestamp, TimestampSettings} from "./editor-utils";

const DEFAULT_SETTINGS: TimestampSettings = {
	headingLevel: 3,
	cursorOnEmptyLine: false,
	vimInsertMode: false,
};

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
		const {containerEl} = this;
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
	}
}

export default class DailyTimestampPlugin extends Plugin {
	settings: TimestampSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DailyTimestampSettingTab(this.app, this));

		this.addCommand({
			id: "insert-or-navigate-timestamp",
			name: "Insert or navigate to timestamp",
			callback: async () => {
				const now = new Date();
				const dateStr =
					now.getFullYear() +
					"-" +
					String(now.getMonth() + 1).padStart(2, "0") +
					"-" +
					String(now.getDate()).padStart(2, "0");
				const dailyPath = `daily/${dateStr}.md`;

				const activeFile = this.app.workspace.getActiveFile();
				const alreadyOpen = activeFile?.path === dailyPath;

				if (!alreadyOpen) {
					const file = this.app.vault.getAbstractFileByPath(dailyPath);
					if (!(file instanceof TFile)) return;

					const leaf = this.app.workspace
						.getLeavesOfType("markdown")
						.find((l) => l.view instanceof MarkdownView && l.view.file?.path === dailyPath);

					if (leaf) {
						this.app.workspace.setActiveLeaf(leaf, {focus: true});
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
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as TimestampSettings | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
