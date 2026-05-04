import {describe, it, expect, vi} from "vitest";
import {findLine, insertOrNavigateTimestamp, computeScrolloffScroll, EditorAdapter, TimestampSettings} from "./editor-utils";

function makeEditor(lines: string[]): EditorAdapter & {lines: string[]} {
	const ed = {
		lines: [...lines],
		lineCount() {
			return ed.lines.length;
		},
		getLine(n: number) {
			return ed.lines[n] ?? "";
		},
		replaceRange(text: string, from: {line: number; ch: number}, to?: {line: number; ch: number}) {
			const endPos = to ?? from;
			const fromLine = ed.lines[from.line] ?? "";
			const endLine = ed.lines[endPos.line] ?? "";
			const before = fromLine.slice(0, from.ch);
			const after = endLine.slice(endPos.ch);
			const inserted = (before + text + after).split("\n");
			ed.lines.splice(from.line, endPos.line - from.line + 1, ...inserted);
		},
		setCursor: vi.fn(),
	};
	return ed;
}

const defaultSettings: TimestampSettings = {
	headingLevel: 3,
	cursorOnEmptyLine: false,
	vimInsertMode: false,
};

// --- findLine ---

describe("findLine", () => {
	it("returns index of first matching line", () => {
		const editor = makeEditor(["foo", "bar", "baz"]);
		expect(findLine(editor, /^bar$/)).toBe(1);
	});

	it("returns -1 when no match", () => {
		const editor = makeEditor(["foo", "bar"]);
		expect(findLine(editor, /^nope$/)).toBe(-1);
	});

	it("respects maxLine limit", () => {
		const editor = makeEditor(["foo", "bar", "baz"]);
		expect(findLine(editor, /^baz$/, 2)).toBe(-1);
		expect(findLine(editor, /^baz$/, 3)).toBe(2);
	});
});

// --- insertOrNavigateTimestamp ---

describe("insertOrNavigateTimestamp", () => {
	const time = new Date(2026, 1, 28, 14, 30); // 14:30

	it("creates a new heading at the bottom of the file", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.lines).toContain("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalled();
	});

	it("places cursor at end of heading line when cursorOnEmptyLine is false", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, cursorOnEmptyLine: false}, time);

		const headingIdx = editor.lines.indexOf("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalledWith({
			line: headingIdx,
			ch: "### 14:30 ".length,
		});
	});

	it("places cursor on empty line below heading when cursorOnEmptyLine is true", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, cursorOnEmptyLine: true}, time);

		const headingIdx = editor.lines.indexOf("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalledWith({
			line: headingIdx + 1,
			ch: 0,
		});
	});

	it("navigates to existing heading and places cursor at end of content", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"### 14:30 ",
			"some note content",
			"",
		]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: "some note content".length,
		});
	});

	it("navigates to existing heading with no content, cursorOnEmptyLine false", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"### 14:30 ",
		]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, cursorOnEmptyLine: false}, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 2,
			ch: "### 14:30 ".length,
		});
	});

	it("navigates to existing heading with no content, cursorOnEmptyLine true", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"### 14:30 ",
		]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, cursorOnEmptyLine: true}, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: 0,
		});
	});

	it("calls enterVimInsertMode when vimInsertMode is enabled", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const vimFn = vi.fn();
		insertOrNavigateTimestamp(editor, vimFn, {...defaultSettings, vimInsertMode: true}, time);

		expect(vimFn).toHaveBeenCalled();
	});

	it("does not call enterVimInsertMode when vimInsertMode is disabled", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const vimFn = vi.fn();
		insertOrNavigateTimestamp(editor, vimFn, {...defaultSettings, vimInsertMode: false}, time);

		expect(vimFn).not.toHaveBeenCalled();
	});

	it("adds newline before heading when last line has content", () => {
		const editor = makeEditor(["# 2026-02-28", "some existing content"]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		const headingIdx = editor.lines.indexOf("### 14:30 ");
		expect(headingIdx).toBeGreaterThan(0);
		expect(editor.lines[headingIdx - 1]).toBe("some existing content");
		expect(editor.lines[headingIdx]).toBe("### 14:30 ");
	});

	it("respects custom heading level", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, headingLevel: 2}, time);

		expect(editor.lines).toContain("## 14:30 ");
	});

	it("skips trailing blank lines when finding end of existing section", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"### 14:30 ",
			"line one",
			"line two",
			"",
			"",
		]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 4,
			ch: "line two".length,
		});
	});

	it("stops section at next heading of same or higher level", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"### 14:30 ",
			"note A",
			"### 15:00 ",
			"note B",
		]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: "note A".length,
		});
	});

	it("creates heading correctly when file has only title (no trailing blank line)", () => {
		const editor = makeEditor(["# 2026-02-28"]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.lines).toContain("### 14:30 ");
		// Heading should not overwrite the title line
		expect(editor.lines[0]).toBe("# 2026-02-28");
	});

	it("creates heading correctly when file has multiple trailing blank lines", () => {
		const editor = makeEditor(["# 2026-02-28", "", "", ""]);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time);

		expect(editor.lines).toContain("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalled();
	});

	it("does not call enterVimInsertMode when function is undefined", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		// Should not throw when enterVimInsertMode is undefined and vimInsertMode is true
		expect(() => {
			insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, vimInsertMode: true}, time);
		}).not.toThrow();
	});

	it("handles headingLevel 1 correctly", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, headingLevel: 1}, time);

		expect(editor.lines).toContain("# 14:30 ");
	});

	it("handles headingLevel 6 correctly", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, headingLevel: 6}, time);

		expect(editor.lines).toContain("###### 14:30 ");
	});

	it("replaces last empty timestamp heading and removes trailing blank lines", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"### 08:59 ",
			"",
			"",
			"",
		]);
		const time0904 = new Date(2026, 1, 28, 9, 4);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time0904);

		expect(editor.lines).toContain("### 09:04 ");
		expect(editor.lines).not.toContain("### 08:59 ");
		// Trailing blank lines should be removed
		expect(editor.lines).toEqual(["# 2026-02-28", "### 09:04 ", ""]);
	});

	it("does not replace last timestamp heading if it has content", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"### 08:59 ",
			"some notes here",
			"",
		]);
		const time0904 = new Date(2026, 1, 28, 9, 4);
		insertOrNavigateTimestamp(editor, undefined, defaultSettings, time0904);

		expect(editor.lines).toContain("### 08:59 ");
		expect(editor.lines).toContain("### 09:04 ");
	});

	it("stops section at higher-level heading (H2 stops at H1 or H2)", () => {
		const editor = makeEditor([
			"# 2026-02-28",
			"",
			"## 14:30 ",
			"note A",
			"## 15:00 ",
			"note B",
		]);
		insertOrNavigateTimestamp(editor, undefined, {...defaultSettings, headingLevel: 2}, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: "note A".length,
		});
	});
});

// --- computeScrolloffScroll ---

describe("computeScrolloffScroll", () => {
	const lineHeight = 20;
	const clientHeight = 400; // 20 visible lines

	it("returns null when cursor sits well inside the viewport", () => {
		// cursor at pixel 100-120, viewport 0..400 — plenty of room below
		const target = computeScrolloffScroll({
			cursorTop: 100,
			cursorBottom: 120,
			scrollTop: 0,
			clientHeight,
			lineHeight,
			scrolloffLines: 5,
		});
		expect(target).toBeNull();
	});

	it("returns a scrollTop that pushes the cursor up by scrolloffLines when too close to bottom", () => {
		// cursor at pixel 390-410, viewport 0..400 — cursor at the bottom edge
		// with 5 lines (100px) of scrolloff, we want visibleBottom >= cursorBottom + 100 = 510
		// so scrollTop should be 510 - 400 = 110
		const target = computeScrolloffScroll({
			cursorTop: 390,
			cursorBottom: 410,
			scrollTop: 0,
			clientHeight,
			lineHeight,
			scrolloffLines: 5,
		});
		expect(target).toBe(110);
	});

	it("returns null when scrolloffLines is 0 (feature disabled)", () => {
		const target = computeScrolloffScroll({
			cursorTop: 390,
			cursorBottom: 410,
			scrollTop: 0,
			clientHeight,
			lineHeight,
			scrolloffLines: 0,
		});
		expect(target).toBeNull();
	});

	it("returns null when cursor is above the viewport (scrolling up handled elsewhere)", () => {
		const target = computeScrolloffScroll({
			cursorTop: 50,
			cursorBottom: 70,
			scrollTop: 200,
			clientHeight,
			lineHeight,
			scrolloffLines: 5,
		});
		expect(target).toBeNull();
	});

	it("accounts for current scrollTop when computing target", () => {
		// viewport currently 500..900, cursor at pixel 880-900 — at the bottom edge
		// with 3 lines (60px) of scrolloff, desired visibleBottom = 960
		// target scrollTop = 960 - 400 = 560
		const target = computeScrolloffScroll({
			cursorTop: 880,
			cursorBottom: 900,
			scrollTop: 500,
			clientHeight,
			lineHeight,
			scrolloffLines: 3,
		});
		expect(target).toBe(560);
	});

	it("triggers scrolloff when cursor is exactly at the visible bottom", () => {
		// cursor bottom == visibleBottom — needs the buffer
		const target = computeScrolloffScroll({
			cursorTop: 380,
			cursorBottom: 400,
			scrollTop: 0,
			clientHeight,
			lineHeight,
			scrolloffLines: 2,
		});
		// desired bottom = 400 + 40 = 440; target = 440 - 400 = 40
		expect(target).toBe(40);
	});
});
