import {App, Editor, MarkdownView, Plugin} from "obsidian";

function enterVimInsertMode(app: App) {
	// @ts-ignore
	if (!app.vault.getConfig("vimMode")) return;
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;
	// @ts-ignore
	const cm = view.editor.cm;
	if (!cm) return;
	cm.contentDOM.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "i",
			code: "KeyI",
			bubbles: true,
			cancelable: true,
		}),
	);
}

function findLine(editor: Editor, re: RegExp, maxLine?: number): number {
	const limit = maxLine ?? editor.lineCount();
	for (let i = 0; i < limit; i++) {
		if (re.test(editor.getLine(i))) return i;
	}
	return -1;
}

function insertOrNavigateTimestamp(editor: Editor, app: App) {
	const now = new Date();
	const timeStr =
		String(now.getHours()).padStart(2, "0") +
		":" +
		String(now.getMinutes()).padStart(2, "0");

	const titleLine = findLine(editor, /^# \d{4}-\d{2}-\d{2}/, 10);
	if (titleLine === -1) return;

	const headingRe = new RegExp(`^## ${timeStr} ?$`);
	let headingLine = findLine(editor, headingRe);

	// Insert heading if it doesn't exist
	if (headingLine === -1) {
		editor.replaceRange(`## ${timeStr} \n`, {line: titleLine + 1, ch: 0});
		headingLine = titleLine + 1;
	}

	// Find end of heading's content block
	let endLine = headingLine;
	for (let j = headingLine + 1; j < editor.lineCount(); j++) {
		if (editor.getLine(j).startsWith("## ")) break;
		endLine = j;
	}
	while (endLine > headingLine && editor.getLine(endLine).trim() === "") {
		endLine--;
	}

	if (endLine === headingLine) {
		// No content — ensure a blank line exists after heading
		const next = headingLine + 1;
		if (next >= editor.lineCount() || editor.getLine(next).startsWith("## ")) {
			editor.replaceRange("\n", {line: headingLine, ch: editor.getLine(headingLine).length});
		}
		editor.setCursor({line: headingLine + 1, ch: 0});
	} else {
		editor.setCursor({line: endLine, ch: editor.getLine(endLine).length});
	}
	enterVimInsertMode(app);
}

export default class DailyTimestampPlugin extends Plugin {
	async onload() {
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

				if (activeFile?.path !== dailyPath) {
					const file = this.app.vault.getAbstractFileByPath(dailyPath);
					if (!file) return;

					const leaf = this.app.workspace
						.getLeavesOfType("markdown")
						.find((l) => (l.view as MarkdownView).file?.path === dailyPath);

					if (leaf) {
						this.app.workspace.setActiveLeaf(leaf, {focus: true});
					} else {
						await this.app.workspace.getLeaf(false).openFile(file as any);
					}
				}

				// Wait for editor to be ready (needed when switching tabs/opening files)
				setTimeout(() => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) insertOrNavigateTimestamp(view.editor, this.app);
				}, activeFile?.path === dailyPath ? 0 : 100);
			},
		});
	}
}
