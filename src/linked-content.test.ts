import { describe, it, expect } from "vitest";
import {
	findHeadingLinkedSections,
	extractHeadingSection,
	HeadingInfo,
	SourceFileInfo,
} from "./linked-content";

function h(line: number, level: number, heading: string): HeadingInfo {
	return { line, level, heading };
}

function ref(line: number) {
	return { position: { start: { line } } };
}

describe("extractHeadingSection", () => {
	it("returns lines between heading and EOF when heading is last", () => {
		const content = ["# Title", "## A", "body 1", "body 2"].join("\n");
		const headings = [h(0, 1, "Title"), h(1, 2, "A")];
		expect(extractHeadingSection(content, headings, 1)).toBe("body 1\nbody 2");
	});

	it("stops at next heading of equal level", () => {
		const content = ["## A", "body A", "## B", "body B"].join("\n");
		const headings = [h(0, 2, "A"), h(2, 2, "B")];
		expect(extractHeadingSection(content, headings, 0)).toBe("body A");
	});

	it("stops at next heading of lower (smaller number) level", () => {
		const content = ["## A", "body A", "# Top", "body Top"].join("\n");
		const headings = [h(0, 2, "A"), h(2, 1, "Top")];
		expect(extractHeadingSection(content, headings, 0)).toBe("body A");
	});

	it("includes deeper sub-headings inside the section", () => {
		const content = ["### timestamp", "para 1", "#### sub", "sub body", "### next"].join("\n");
		const headings = [h(0, 3, "timestamp"), h(2, 4, "sub"), h(4, 3, "next")];
		expect(extractHeadingSection(content, headings, 0)).toBe("para 1\n#### sub\nsub body");
	});

	it("trims trailing blank lines", () => {
		const content = ["## A", "body", "", "", "## B"].join("\n");
		const headings = [h(0, 2, "A"), h(4, 2, "B")];
		expect(extractHeadingSection(content, headings, 0)).toBe("body");
	});

	it("returns empty string for an empty section", () => {
		const content = ["## A", "", "## B"].join("\n");
		const headings = [h(0, 2, "A"), h(2, 2, "B")];
		expect(extractHeadingSection(content, headings, 0)).toBe("");
	});
});

describe("findHeadingLinkedSections", () => {
	it("emits a section for each source heading that contains a link to the target", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "daily/2026-05-04.md",
				basename: "2026-05-04",
				content: ["# 2026-05-04", "### 09:30 [[topics/React]]", "content X", "more"].join("\n"),
				headings: [h(0, 1, "2026-05-04"), h(1, 3, "09:30 [[topics/React]]")],
				refs: [ref(1)],
			},
		];
		const result = findHeadingLinkedSections("topics/React.md", sources);
		expect(result).toEqual([
			{
				sourcePath: "daily/2026-05-04.md",
				sourceBasename: "2026-05-04",
				headingText: "09:30 [[topics/React]]",
				sectionMarkdown: "content X\nmore",
			},
		]);
	});

	it("ignores body links (not on a heading line)", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "daily/2026-05-04.md",
				basename: "2026-05-04",
				content: ["### 09:30", "Some text [[topics/React]] inline"].join("\n"),
				headings: [h(0, 3, "09:30")],
				refs: [ref(1)],
			},
		];
		expect(findHeadingLinkedSections("topics/React.md", sources)).toEqual([]);
	});

	it("dedupes multiple links on the same heading line", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "daily/2026-05-04.md",
				basename: "2026-05-04",
				content: ["### 09:30 [[topics/React]] [[topics/React|alias]]", "X"].join("\n"),
				headings: [h(0, 3, "09:30 [[topics/React]] [[topics/React|alias]]")],
				refs: [ref(0), ref(0)],
			},
		];
		const result = findHeadingLinkedSections("topics/React.md", sources);
		expect(result).toHaveLength(1);
		expect(result[0]?.sectionMarkdown).toBe("X");
	});

	it("emits separate sections for distinct headings in the same source file", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "daily/2026-05-04.md",
				basename: "2026-05-04",
				content: ["### 09:30 [[T]]", "first", "### 14:00 [[T]]", "second"].join("\n"),
				headings: [h(0, 3, "09:30 [[T]]"), h(2, 3, "14:00 [[T]]")],
				refs: [ref(0), ref(2)],
			},
		];
		const result = findHeadingLinkedSections("T.md", sources);
		expect(result.map(r => r.sectionMarkdown)).toEqual(["first", "second"]);
		expect(result.map(r => r.headingText)).toEqual(["09:30 [[T]]", "14:00 [[T]]"]);
	});

	it("skips the target file itself (self-link)", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "topics/React.md",
				basename: "React",
				content: ["## Self [[topics/React]]", "x"].join("\n"),
				headings: [h(0, 2, "Self [[topics/React]]")],
				refs: [ref(0)],
			},
		];
		expect(findHeadingLinkedSections("topics/React.md", sources)).toEqual([]);
	});

	it("returns empty when no source has heading-line backlinks", () => {
		expect(findHeadingLinkedSections("topics/React.md", [])).toEqual([]);
	});

	it("includes sub-headings inside section but stops at next equal-level", () => {
		const sources: SourceFileInfo[] = [
			{
				path: "daily/2026-05-04.md",
				basename: "2026-05-04",
				content: ["### 09:30 [[T]]", "para", "#### sub", "sub body", "### 14:00"].join("\n"),
				headings: [h(0, 3, "09:30 [[T]]"), h(2, 4, "sub"), h(4, 3, "14:00")],
				refs: [ref(0)],
			},
		];
		const result = findHeadingLinkedSections("T.md", sources);
		expect(result[0]?.sectionMarkdown).toBe("para\n#### sub\nsub body");
	});
});
