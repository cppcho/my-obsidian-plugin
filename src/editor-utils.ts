export interface EditorAdapter {
	lineCount(): number;
	getLine(n: number): string;
	replaceRange(text: string, from: {line: number; ch: number}): void;
	setCursor(pos: {line: number; ch: number}): void;
}

export interface AppAdapter {
	isVimMode(): boolean;
	enterVimInsertMode(): void;
}

export interface TimestampSettings {
	headingLevel: number;
	cursorOnEmptyLine: boolean;
	vimInsertMode: boolean;
}

export function findLine(editor: EditorAdapter, re: RegExp, maxLine?: number): number {
	const limit = maxLine ?? editor.lineCount();
	for (let i = 0; i < limit; i++) {
		if (re.test(editor.getLine(i))) return i;
	}
	return -1;
}

export function insertOrNavigateTimestamp(
	editor: EditorAdapter,
	app: AppAdapter,
	settings: TimestampSettings,
	now: Date = new Date(),
) {
	const timeStr =
		String(now.getHours()).padStart(2, "0") +
		":" +
		String(now.getMinutes()).padStart(2, "0");

	const prefix = "#".repeat(settings.headingLevel);
	const headingRe = new RegExp(`^${prefix} ${timeStr}( |$)`);
	let headingLine = findLine(editor, headingRe);
	const isNew = headingLine === -1;

	if (isNew) {
		const lastLine = editor.lineCount() - 1;
		const lastLineText = editor.getLine(lastLine);

		let insert = "";
		if (lastLineText.trim() !== "") {
			insert += "\n";
		}
		insert += `${prefix} ${timeStr} \n`;

		editor.replaceRange(insert, {line: lastLine, ch: lastLineText.length});
		headingLine = findLine(editor, headingRe);
		if (headingLine === -1) return;
	}

	if (isNew) {
		if (settings.cursorOnEmptyLine) {
			const next = headingLine + 1;
			if (next >= editor.lineCount() || editor.getLine(next).trim() !== "") {
				editor.replaceRange("\n", {line: headingLine, ch: editor.getLine(headingLine).length});
			}
			editor.setCursor({line: headingLine + 1, ch: 0});
		} else {
			editor.setCursor({line: headingLine, ch: editor.getLine(headingLine).length});
		}
	} else {
		const headingPrefix = new RegExp(`^#{1,${settings.headingLevel}} `);
		let endLine = headingLine;
		for (let j = headingLine + 1; j < editor.lineCount(); j++) {
			if (headingPrefix.test(editor.getLine(j))) break;
			endLine = j;
		}
		while (endLine > headingLine && editor.getLine(endLine).trim() === "") {
			endLine--;
		}
		if (endLine === headingLine) {
			if (settings.cursorOnEmptyLine) {
				const next = headingLine + 1;
				if (next >= editor.lineCount() || editor.getLine(next).trim() !== "") {
					editor.replaceRange("\n", {line: headingLine, ch: editor.getLine(headingLine).length});
				}
				editor.setCursor({line: headingLine + 1, ch: 0});
			} else {
				editor.setCursor({line: headingLine, ch: editor.getLine(headingLine).length});
			}
		} else {
			editor.setCursor({line: endLine, ch: editor.getLine(endLine).length});
		}
	}

	if (settings.vimInsertMode) {
		app.enterVimInsertMode();
	}
}
