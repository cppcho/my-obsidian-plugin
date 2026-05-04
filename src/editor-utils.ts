export interface EditorAdapter {
	lineCount(): number;
	getLine(n: number): string;
	replaceRange(text: string, from: {line: number; ch: number}, to?: {line: number; ch: number}): void;
	setCursor(pos: {line: number; ch: number}): void;
}

export interface TimestampSettings {
	headingLevel: number;
	cursorOnEmptyLine: boolean;
	vimInsertMode: boolean;
	scrolloffLines: number;
}

export interface ScrolloffInput {
	cursorTop: number;
	cursorBottom: number;
	scrollTop: number;
	clientHeight: number;
	lineHeight: number;
	scrolloffLines: number;
}

export function computeScrolloffScroll(input: ScrolloffInput): number | null {
	const {cursorBottom, scrollTop, clientHeight, lineHeight, scrolloffLines} = input;
	if (scrolloffLines <= 0) return null;
	const margin = scrolloffLines * lineHeight;
	const desiredVisibleBottom = cursorBottom + margin;
	const visibleBottom = scrollTop + clientHeight;
	if (desiredVisibleBottom <= visibleBottom) return null;
	return desiredVisibleBottom - clientHeight;
}

export function findLine(editor: EditorAdapter, re: RegExp, maxLine?: number): number {
	const limit = maxLine ?? editor.lineCount();
	for (let i = 0; i < limit; i++) {
		if (re.test(editor.getLine(i))) return i;
	}
	return -1;
}

function placeCursorAtHeading(editor: EditorAdapter, headingLine: number, cursorOnEmptyLine: boolean) {
	if (cursorOnEmptyLine) {
		const next = headingLine + 1;
		if (next >= editor.lineCount() || editor.getLine(next).trim() !== "") {
			editor.replaceRange("\n", {line: headingLine, ch: editor.getLine(headingLine).length});
		}
		editor.setCursor({line: headingLine + 1, ch: 0});
	} else {
		editor.setCursor({line: headingLine, ch: editor.getLine(headingLine).length});
	}
}

export function insertOrNavigateTimestamp(
	editor: EditorAdapter,
	enterVimInsertMode: (() => void) | undefined,
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

	if (headingLine === -1) {
		// Check if the last timestamp heading has no content — if so, replace it
		const lastHeadingRe = new RegExp(`^${prefix} \\d{2}:\\d{2}( |$)`);
		let lastHeadingLine = -1;
		for (let i = 0; i < editor.lineCount(); i++) {
			if (lastHeadingRe.test(editor.getLine(i))) lastHeadingLine = i;
		}

		if (lastHeadingLine !== -1) {
			let hasContent = false;
			for (let j = lastHeadingLine + 1; j < editor.lineCount(); j++) {
				if (editor.getLine(j).trim() !== "") {
					hasContent = true;
					break;
				}
			}
			if (!hasContent) {
				// Replace the empty heading and trailing blank lines with the new timestamp
				const lastLine = editor.lineCount() - 1;
				editor.replaceRange(`${prefix} ${timeStr} \n`, {line: lastHeadingLine, ch: 0}, {line: lastLine, ch: editor.getLine(lastLine).length});
				placeCursorAtHeading(editor, lastHeadingLine, settings.cursorOnEmptyLine);
				if (settings.vimInsertMode && enterVimInsertMode) {
					enterVimInsertMode();
				}
				return;
			}
		}

		const lastLine = editor.lineCount() - 1;
		const lastLineText = editor.getLine(lastLine);

		let lastNonBlankLine = lastLine;
		while (lastNonBlankLine >= 0 && editor.getLine(lastNonBlankLine).trim() === "") {
			lastNonBlankLine--;
		}

		if (lastNonBlankLine < 0) {
			editor.replaceRange(`${prefix} ${timeStr} \n`, {line: 0, ch: 0}, {line: lastLine, ch: lastLineText.length});
			headingLine = 0;
		} else {
			editor.replaceRange(
				`\n${prefix} ${timeStr} \n`,
				{line: lastNonBlankLine, ch: editor.getLine(lastNonBlankLine).length},
				{line: lastLine, ch: lastLineText.length},
			);
			headingLine = lastNonBlankLine + 1;
		}
		placeCursorAtHeading(editor, headingLine, settings.cursorOnEmptyLine);
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
			placeCursorAtHeading(editor, headingLine, settings.cursorOnEmptyLine);
		} else {
			editor.setCursor({line: endLine, ch: editor.getLine(endLine).length});
		}
	}

	if (settings.vimInsertMode && enterVimInsertMode) {
		enterVimInsertMode();
	}
}
