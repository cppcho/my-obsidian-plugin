import type { TFile } from "obsidian";

export interface DateLike {
	format(format: string): string;
}

export interface DailyNoteSettings {
	format?: string;
	folder?: string;
}

export interface DailyNoteAdapter {
	appHasDailyNotesPluginLoaded(): boolean;
	getDailyNoteSettings(): DailyNoteSettings;
	getNoteByPath(path: string): TFile | null;
	createDailyNote(date: DateLike): Promise<TFile | undefined>;
}

export type DailyNoteResult = { file: TFile } | { error: "plugin-disabled" | "create-failed" };

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

export function dailyNotePath(settings: DailyNoteSettings, date: DateLike): string {
	const filename = `${date.format(settings.format?.trim() || DEFAULT_DAILY_NOTE_FORMAT)}.md`;
	const folder = settings.folder?.replace(/^\/+|\/+$/g, "") ?? "";
	return folder ? `${folder}/${filename}` : filename;
}

export async function getOrCreateDailyNote(adapter: DailyNoteAdapter, date: DateLike): Promise<DailyNoteResult> {
	if (!adapter.appHasDailyNotesPluginLoaded()) return { error: "plugin-disabled" };
	// Resolve the note by its path instead of obsidian-daily-notes-interface's
	// day-keyed map: with a non-daily format (e.g. weekly "YYYY-[w]ww") the map
	// only matches on the first day of the period, so every other day the lookup
	// misses and the create collides with the existing file.
	const existing = adapter.getNoteByPath(dailyNotePath(adapter.getDailyNoteSettings(), date));
	if (existing) return { file: existing };
	try {
		const created = await adapter.createDailyNote(date);
		return created ? { file: created } : { error: "create-failed" };
	} catch {
		return { error: "create-failed" };
	}
}
