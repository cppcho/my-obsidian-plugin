import type { TFile } from "obsidian";

export interface DailyNoteAdapter {
	appHasDailyNotesPluginLoaded(): boolean;
	getAllDailyNotes(): Record<string, TFile>;
	getDailyNote(date: unknown, allNotes: Record<string, TFile>): TFile | undefined;
	createDailyNote(date: unknown): Promise<TFile>;
}

export async function getOrCreateDailyNote(adapter: DailyNoteAdapter, date: unknown): Promise<TFile | null> {
	if (!adapter.appHasDailyNotesPluginLoaded()) return null;
	const allNotes = adapter.getAllDailyNotes();
	const existing = adapter.getDailyNote(date, allNotes);
	if (existing) return existing;
	return adapter.createDailyNote(date);
}
