import {describe, it, expect, vi} from "vitest";
import {findLine, insertOrNavigateTimestamp, EditorAdapter, AppAdapter, TimestampSettings} from "./editor-utils";

function makeEditor(lines: string[]): EditorAdapter & {lines: string[]} {
	const ed = {
		lines: [...lines],
		lineCount() {
			return ed.lines.length;
		},
		getLine(n: number) {
			return ed.lines[n] ?? "";
		},
		replaceRange(text: string, from: {line: number; ch: number}) {
			const line = ed.lines[from.line] ?? "";
			const before = line.slice(0, from.ch);
			const after = line.slice(from.ch);
			const inserted = (before + text + after).split("\n");
			ed.lines.splice(from.line, 1, ...inserted);
		},
		setCursor: vi.fn(),
	};
	return ed;
}

function makeApp(vim = false): AppAdapter & {enterVimInsertMode: ReturnType<typeof vi.fn>} {
	return {
		isVimMode: () => vim,
		enterVimInsertMode: vi.fn(),
	};
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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, defaultSettings, time);

		expect(editor.lines).toContain("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalled();
	});

	it("places cursor at end of heading line when cursorOnEmptyLine is false", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, cursorOnEmptyLine: false}, time);

		const headingIdx = editor.lines.indexOf("### 14:30 ");
		expect(editor.setCursor).toHaveBeenCalledWith({
			line: headingIdx,
			ch: "### 14:30 ".length,
		});
	});

	it("places cursor on empty line below heading when cursorOnEmptyLine is true", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, cursorOnEmptyLine: true}, time);

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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, defaultSettings, time);

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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, cursorOnEmptyLine: false}, time);

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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, cursorOnEmptyLine: true}, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: 0,
		});
	});

	it("calls enterVimInsertMode when vimInsertMode is enabled", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const app = makeApp(true);
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, vimInsertMode: true}, time);

		expect(app.enterVimInsertMode).toHaveBeenCalled();
	});

	it("does not call enterVimInsertMode when vimInsertMode is disabled", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const app = makeApp(true);
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, vimInsertMode: false}, time);

		expect(app.enterVimInsertMode).not.toHaveBeenCalled();
	});

	it("adds newline before heading when last line has content", () => {
		const editor = makeEditor(["# 2026-02-28", "some existing content"]);
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, defaultSettings, time);

		const headingIdx = editor.lines.indexOf("### 14:30 ");
		expect(headingIdx).toBeGreaterThan(0);
		// Heading should be on its own line, not appended to existing content
		expect(editor.lines[headingIdx - 1]).toBe("some existing content");
		expect(editor.lines[headingIdx]).toBe("### 14:30 ");
	});

	it("respects custom heading level", () => {
		const editor = makeEditor(["# 2026-02-28", ""]);
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, {...defaultSettings, headingLevel: 2}, time);

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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, defaultSettings, time);

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
		const app = makeApp();
		insertOrNavigateTimestamp(editor, app, defaultSettings, time);

		expect(editor.setCursor).toHaveBeenCalledWith({
			line: 3,
			ch: "note A".length,
		});
	});
});
