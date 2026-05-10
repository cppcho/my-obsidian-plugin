export interface HeadingInfo {
	heading: string;
	level: number;
	line: number;
}

export interface BacklinkRef {
	position: { start: { line: number } };
}

export interface SourceFileInfo {
	path: string;
	basename: string;
	content: string;
	headings: HeadingInfo[];
	refs: BacklinkRef[];
}

export interface LinkedSection {
	sourcePath: string;
	sourceBasename: string;
	headingText: string;
	headingLine: number;
	sectionMarkdown: string;
}

export function extractHeadingSection(
	content: string,
	headings: HeadingInfo[],
	headingIndex: number,
): string {
	const heading = headings[headingIndex];
	if (!heading) return "";
	const lines = content.split("\n");
	let endLine = lines.length;
	for (let i = headingIndex + 1; i < headings.length; i++) {
		const next = headings[i];
		if (next && next.level <= heading.level) {
			endLine = next.line;
			break;
		}
	}
	const sectionLines = lines.slice(heading.line + 1, endLine);
	while (sectionLines.length > 0 && (sectionLines[sectionLines.length - 1] ?? "").trim() === "") {
		sectionLines.pop();
	}
	return sectionLines.join("\n");
}

export function findHeadingLinkedSections(
	targetPath: string,
	sources: SourceFileInfo[],
): LinkedSection[] {
	const result: LinkedSection[] = [];
	for (const source of sources) {
		if (source.path === targetPath) continue;
		const used = new Set<number>();
		for (const r of source.refs) {
			const idx = source.headings.findIndex(h => h.line === r.position.start.line);
			if (idx === -1 || used.has(idx)) continue;
			used.add(idx);
			const heading = source.headings[idx];
			result.push({
				sourcePath: source.path,
				sourceBasename: source.basename,
				headingText: heading?.heading ?? "",
				headingLine: heading?.line ?? 0,
				sectionMarkdown: extractHeadingSection(source.content, source.headings, idx),
			});
		}
	}
	return result;
}
