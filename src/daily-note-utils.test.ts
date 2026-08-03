import { describe, it, expect, vi } from "vitest";
import { getOrCreateDailyNote, dailyNotePath, DailyNoteAdapter, DateLike } from "./daily-note-utils";

function makeMockFile(path: string) {
	return { path, basename: path.split("/").pop()!.replace(".md", "") } as any;
}

function makeDate(formatted: string): DateLike {
	return { format: () => formatted };
}

function makeAdapter(overrides: Partial<DailyNoteAdapter> = {}): DailyNoteAdapter {
	return {
		appHasDailyNotesPluginLoaded: () => true,
		getDailyNoteSettings: () => ({ folder: "daily", format: "YYYY-MM-DD" }),
		getNoteByPath: () => null,
		createDailyNote: vi.fn(async () => makeMockFile("daily/2026-03-01.md")),
		...overrides,
	};
}

describe("dailyNotePath", () => {
	it("joins folder, formatted date, and .md extension", () => {
		expect(dailyNotePath({ folder: "daily", format: "YYYY-MM-DD" }, makeDate("2026-03-01"))).toBe("daily/2026-03-01.md");
	});

	it("handles a missing folder and trailing slashes", () => {
		expect(dailyNotePath({ format: "YYYY-MM-DD" }, makeDate("2026-03-01"))).toBe("2026-03-01.md");
		expect(dailyNotePath({ folder: "daily/", format: "YYYY-MM-DD" }, makeDate("2026-03-01"))).toBe("daily/2026-03-01.md");
	});

	it("falls back to YYYY-MM-DD when format is empty", () => {
		const date = { format: vi.fn(() => "2026-03-01") };
		dailyNotePath({ folder: "daily", format: "" }, date);
		expect(date.format).toHaveBeenCalledWith("YYYY-MM-DD");
	});
});

describe("getOrCreateDailyNote", () => {
	const date = makeDate("2026-03-01");

	it("reports plugin-disabled when Daily Notes plugin is not loaded", async () => {
		const adapter = makeAdapter({ appHasDailyNotesPluginLoaded: () => false });
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toEqual({ error: "plugin-disabled" });
	});

	it("returns existing note without calling createDailyNote", async () => {
		const existingFile = makeMockFile("daily/2026-03-01.md");
		const adapter = makeAdapter({
			getNoteByPath: (path) => (path === "daily/2026-03-01.md" ? existingFile : null),
		});
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toEqual({ file: existingFile });
		expect(adapter.createDailyNote).not.toHaveBeenCalled();
	});

	it("finds an existing weekly note mid-week via its path", async () => {
		// Regression: with format "YYYY-[w]ww" every day of the week formats to the
		// same filename, so the path lookup must hit even when the note was
		// created on an earlier day of the week.
		const weeklyFile = makeMockFile("weekly/2026-w32.md");
		const adapter = makeAdapter({
			getDailyNoteSettings: () => ({ folder: "weekly", format: "YYYY-[w]ww" }),
			getNoteByPath: (path) => (path === "weekly/2026-w32.md" ? weeklyFile : null),
		});
		const result = await getOrCreateDailyNote(adapter, makeDate("2026-w32"));
		expect(result).toEqual({ file: weeklyFile });
		expect(adapter.createDailyNote).not.toHaveBeenCalled();
	});

	it("creates and returns new note when it does not exist", async () => {
		const newFile = makeMockFile("daily/2026-03-01.md");
		const adapter = makeAdapter({
			createDailyNote: vi.fn(async () => newFile),
		});
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toEqual({ file: newFile });
		expect(adapter.createDailyNote).toHaveBeenCalledWith(date);
	});

	it("reports create-failed when createDailyNote returns nothing", async () => {
		const adapter = makeAdapter({ createDailyNote: vi.fn(async () => undefined) });
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toEqual({ error: "create-failed" });
	});

	it("reports create-failed when createDailyNote throws", async () => {
		const adapter = makeAdapter({
			createDailyNote: vi.fn(async () => {
				throw new Error("File already exists");
			}),
		});
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toEqual({ error: "create-failed" });
	});
});
