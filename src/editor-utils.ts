import {escapeRegExp, timestampPatternSource} from "./timestamp-format";

export interface EditorAdapter {
	lineCount(): number;
	getLine(n: number): string;
	replaceRange(text: string, from: {line: number; ch: number}, to?: {line: number; ch: number}): void;
	setCursor(pos: {line: number; ch: number}): void;
}

/** Where a new timestamp heading goes: appended at the end, or newest-first at the top. */
export type InsertPosition = "top" | "bottom";

export interface TimestampSettings {
	headingLevel: number;
	/** Moment format used to render the timestamp heading, e.g. "HH:mm". */
	headingFormat: string;
	cursorOnEmptyLine: boolean;
	vimInsertMode: boolean;
	scrolloffLines: number;
	showLinkedContent: boolean;
	insertPosition: InsertPosition;
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

const ANY_HEADING_RE = /^#{1,6} /;

/** First line after the frontmatter block, or 0 when the note has none. */
function bodyStart(editor: EditorAdapter): number {
	if (editor.getLine(0).trim() !== "---") return 0;
	for (let i = 1; i < editor.lineCount(); i++) {
		if (editor.getLine(i).trim() === "---") return i + 1;
	}
	return 0;
}

/**
 * First heading below the note's title heading — the anchor a top insert falls back
 * to when there is no timestamp heading yet. Returns -1 when the title is the only
 * heading, so everything before it (title, preamble text) stays above the new entry.
 */
function firstHeadingBelowTitle(editor: EditorAdapter): number {
	const start = bodyStart(editor);
	let titleLine = -1;
	for (let i = start; i < editor.lineCount(); i++) {
		if (ANY_HEADING_RE.test(editor.getLine(i))) {
			titleLine = i;
			break;
		}
	}
	if (titleLine === -1) return -1;
	for (let i = titleLine + 1; i < editor.lineCount(); i++) {
		if (ANY_HEADING_RE.test(editor.getLine(i))) return i;
	}
	return -1;
}

/**
 * True when nothing but blank lines follows the heading, up to `boundaryRe` (the next
 * heading that ends the section) or the end of the file when no boundary is given.
 */
function sectionIsEmpty(editor: EditorAdapter, headingLine: number, boundaryRe?: RegExp): boolean {
	for (let i = headingLine + 1; i < editor.lineCount(); i++) {
		const line = editor.getLine(i);
		if (boundaryRe?.test(line)) return true;
		if (line.trim() !== "") return false;
	}
	return true;
}

/** Appends the heading after the last non-blank line, dropping any trailing blanks. Returns its line. */
function appendHeading(editor: EditorAdapter, heading: string): number {
	const lastLine = editor.lineCount() - 1;
	const lastLineText = editor.getLine(lastLine);

	let lastNonBlankLine = lastLine;
	while (lastNonBlankLine >= 0 && editor.getLine(lastNonBlankLine).trim() === "") {
		lastNonBlankLine--;
	}

	if (lastNonBlankLine < 0) {
		editor.replaceRange(`${heading}\n`, {line: 0, ch: 0}, {line: lastLine, ch: lastLineText.length});
		return 0;
	}
	editor.replaceRange(
		`\n${heading}\n`,
		{line: lastNonBlankLine, ch: editor.getLine(lastNonBlankLine).length},
		{line: lastLine, ch: lastLineText.length},
	);
	return lastNonBlankLine + 1;
}

function insertHeadingAtTop(
	editor: EditorAdapter,
	settings: TimestampSettings,
	heading: string,
	timestampHeadingRe: RegExp,
): number {
	const anchor = findLine(editor, timestampHeadingRe);
	if (anchor !== -1) {
		// An empty newest entry is restamped rather than stacking another empty heading.
		if (sectionIsEmpty(editor, anchor, new RegExp(`^#{1,${settings.headingLevel}} `))) {
			editor.replaceRange(heading, {line: anchor, ch: 0}, {line: anchor, ch: editor.getLine(anchor).length});
			return anchor;
		}
		editor.replaceRange(`${heading}\n\n`, {line: anchor, ch: 0});
		return anchor;
	}

	const belowTitle = firstHeadingBelowTitle(editor);
	if (belowTitle !== -1) {
		editor.replaceRange(`${heading}\n\n`, {line: belowTitle, ch: 0});
		return belowTitle;
	}
	return appendHeading(editor, heading);
}

function insertHeadingAtBottom(
	editor: EditorAdapter,
	settings: TimestampSettings,
	heading: string,
	timestampHeadingRe: RegExp,
): number {
	let lastHeadingLine = -1;
	for (let i = 0; i < editor.lineCount(); i++) {
		if (timestampHeadingRe.test(editor.getLine(i))) lastHeadingLine = i;
	}

	if (lastHeadingLine !== -1 && sectionIsEmpty(editor, lastHeadingLine)) {
		// Replace the empty heading and the trailing blank lines below it.
		const lastLine = editor.lineCount() - 1;
		editor.replaceRange(`${heading}\n`, {line: lastHeadingLine, ch: 0}, {line: lastLine, ch: editor.getLine(lastLine).length});
		return lastHeadingLine;
	}
	return appendHeading(editor, heading);
}

export function insertOrNavigateTimestamp(
	editor: EditorAdapter,
	enterVimInsertMode: (() => void) | undefined,
	settings: TimestampSettings,
	timeStr: string,
) {
	const prefix = "#".repeat(settings.headingLevel);
	const headingRe = new RegExp(`^${prefix} ${escapeRegExp(timeStr)}( |$)`);
	const headingLine = findLine(editor, headingRe);

	if (headingLine === -1) {
		const timestampHeadingRe = new RegExp(`^${prefix} ${timestampPatternSource(settings.headingFormat)}( |$)`);
		const heading = `${prefix} ${timeStr} `;
		const inserted = settings.insertPosition === "top"
			? insertHeadingAtTop(editor, settings, heading, timestampHeadingRe)
			: insertHeadingAtBottom(editor, settings, heading, timestampHeadingRe);
		placeCursorAtHeading(editor, inserted, settings.cursorOnEmptyLine);
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
