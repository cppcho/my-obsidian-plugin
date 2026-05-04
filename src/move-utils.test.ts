import { describe, it, expect } from "vitest";
import { getFragmentTargetPath } from "./move-utils";

describe("getFragmentTargetPath", () => {
	it("moves a root-level file with YYYYMMDD prefix to fragments/", () => {
		expect(getFragmentTargetPath("20260504-foo.md")).toBe("fragments/20260504-foo.md");
	});

	it("moves a subfolder file with YYYYMMDD prefix to fragments/", () => {
		expect(getFragmentTargetPath("inbox/20260504-foo.md")).toBe("fragments/20260504-foo.md");
	});

	it("moves a deeply nested file with YYYYMMDD prefix to fragments/", () => {
		expect(getFragmentTargetPath("a/b/c/20260504-foo.md")).toBe("fragments/20260504-foo.md");
	});

	it("matches a file whose basename is exactly the date plus extension", () => {
		expect(getFragmentTargetPath("20260504.md")).toBe("fragments/20260504.md");
	});

	it("matches with various separators after the date", () => {
		expect(getFragmentTargetPath("20260504_note.md")).toBe("fragments/20260504_note.md");
		expect(getFragmentTargetPath("20260504 note.md")).toBe("fragments/20260504 note.md");
		expect(getFragmentTargetPath("20260504.note.md")).toBe("fragments/20260504.note.md");
	});

	it("returns null for a file already in fragments/", () => {
		expect(getFragmentTargetPath("fragments/20260504-foo.md")).toBeNull();
	});

	it("returns null for a file in daily/", () => {
		expect(getFragmentTargetPath("daily/2026-05-04.md")).toBeNull();
	});

	it("returns null for files in daily/ even with YYYYMMDD prefix basename", () => {
		expect(getFragmentTargetPath("daily/20260504-foo.md")).toBeNull();
	});

	it("returns null when basename has no leading digits", () => {
		expect(getFragmentTargetPath("notes/foo.md")).toBeNull();
	});

	it("returns null when basename has fewer than 8 leading digits", () => {
		expect(getFragmentTargetPath("notes/2026504-foo.md")).toBeNull();
		expect(getFragmentTargetPath("notes/1234567-foo.md")).toBeNull();
	});

	it("returns null when basename has more than 8 leading digits", () => {
		expect(getFragmentTargetPath("notes/202605041-foo.md")).toBeNull();
		expect(getFragmentTargetPath("notes/123456789.md")).toBeNull();
	});

	it("returns null when month is out of range", () => {
		expect(getFragmentTargetPath("20261304-foo.md")).toBeNull();
		expect(getFragmentTargetPath("20260004-foo.md")).toBeNull();
	});

	it("returns null when day is out of range", () => {
		expect(getFragmentTargetPath("20260532-foo.md")).toBeNull();
		expect(getFragmentTargetPath("20260500-foo.md")).toBeNull();
	});

	it("accepts boundary dates", () => {
		expect(getFragmentTargetPath("20260101-foo.md")).toBe("fragments/20260101-foo.md");
		expect(getFragmentTargetPath("20261231-foo.md")).toBe("fragments/20261231-foo.md");
	});

	it("works for non-markdown files too", () => {
		expect(getFragmentTargetPath("attachments/20260504-image.png")).toBe("fragments/20260504-image.png");
	});

	it("returns null for nested fragments/ path", () => {
		expect(getFragmentTargetPath("fragments/sub/20260504-foo.md")).toBeNull();
	});
});
