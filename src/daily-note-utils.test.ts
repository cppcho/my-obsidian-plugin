import { describe, it, expect, vi } from "vitest";
import { getOrCreateDailyNote, DailyNoteAdapter } from "./daily-note-utils";

function makeMockFile(path: string) {
	return { path, basename: path.split("/").pop()!.replace(".md", "") } as any;
}

function makeAdapter(overrides: Partial<DailyNoteAdapter> = {}): DailyNoteAdapter {
	return {
		appHasDailyNotesPluginLoaded: () => true,
		getAllDailyNotes: () => ({}),
		getDailyNote: () => undefined,
		createDailyNote: vi.fn(async () => makeMockFile("daily/2026-03-01.md")),
		...overrides,
	};
}

describe("getOrCreateDailyNote", () => {
	const date = {} as any; // moment-like object, opaque to our function

	it("returns null when Daily Notes plugin is not loaded", async () => {
		const adapter = makeAdapter({ appHasDailyNotesPluginLoaded: () => false });
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toBeNull();
	});

	it("returns existing note without calling createDailyNote", async () => {
		const existingFile = makeMockFile("daily/2026-03-01.md");
		const adapter = makeAdapter({
			getDailyNote: () => existingFile,
		});
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toBe(existingFile);
		expect(adapter.createDailyNote).not.toHaveBeenCalled();
	});

	it("creates and returns new note when it does not exist", async () => {
		const newFile = makeMockFile("daily/2026-03-01.md");
		const adapter = makeAdapter({
			getDailyNote: () => undefined,
			createDailyNote: vi.fn(async () => newFile),
		});
		const result = await getOrCreateDailyNote(adapter, date);
		expect(result).toBe(newFile);
		expect(adapter.createDailyNote).toHaveBeenCalledWith(date);
	});
});
