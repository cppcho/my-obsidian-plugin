import {describe, it, expect} from "vitest";
import {DEFAULT_HEADING_FORMAT, escapeRegExp, timestampPatternSource} from "./timestamp-format";

function matcher(format: string): RegExp {
	return new RegExp(`^${timestampPatternSource(format)}$`);
}

describe("escapeRegExp", () => {
	it("escapes regex metacharacters", () => {
		expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
		expect(new RegExp(escapeRegExp("14.30")).test("14a30")).toBe(false);
		expect(new RegExp(escapeRegExp("14.30")).test("14.30")).toBe(true);
	});
});

describe("timestampPatternSource", () => {
	it("defaults to HH:mm", () => {
		expect(DEFAULT_HEADING_FORMAT).toBe("HH:mm");
	});

	it("matches zero-padded 24-hour times", () => {
		const re = matcher("HH:mm");
		expect(re.test("14:30")).toBe(true);
		expect(re.test("09:05")).toBe(true);
		expect(re.test("9:05")).toBe(false);
		expect(re.test("nope")).toBe(false);
	});

	it("matches 12-hour times with meridiem", () => {
		const re = matcher("h:mm A");
		expect(re.test("2:30 PM")).toBe(true);
		expect(re.test("11:05 AM")).toBe(true);
		expect(re.test("11:05 am")).toBe(false);
		expect(matcher("h:mm a").test("2:30 pm")).toBe(true);
	});

	it("matches seconds and 24-hour hours without padding", () => {
		expect(matcher("H:mm:ss").test("7:05:09")).toBe(true);
		expect(matcher("HH:mm:ss").test("07:05:09")).toBe(true);
	});

	it("treats bracketed text as a literal", () => {
		const re = matcher("[at] HH:mm");
		expect(re.test("at 14:30")).toBe(true);
		expect(re.test("HH 14:30")).toBe(false);
	});

	it("escapes literal separators", () => {
		const re = matcher("HH.mm");
		expect(re.test("14.30")).toBe(true);
		expect(re.test("14a30")).toBe(false);
	});

	it("matches date tokens", () => {
		expect(matcher("YYYY-MM-DD HH:mm").test("2026-02-28 14:30")).toBe(true);
		expect(matcher("MMM D").test("Feb 8")).toBe(true);
		expect(matcher("dddd HH:mm").test("Saturday 14:30")).toBe(true);
		expect(matcher("Do").test("28th")).toBe(true);
	});

	it("falls back to the default format when given an empty format", () => {
		expect(matcher("").test("14:30")).toBe(true);
	});
});
