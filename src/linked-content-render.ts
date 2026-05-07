export interface LinkedSection {
	sourcePath: string;
	sourceBasename: string;
	headingText: string;
	sectionMarkdown: string;
}

export type RenderFn = (markdown: string, el: HTMLElement) => Promise<void>;

export async function renderLinkedSections(
	container: HTMLElement,
	items: LinkedSection[],
	render: RenderFn,
): Promise<void> {
	if (items.length === 0) return;
	const doc = container.ownerDocument;
	for (const item of items) {
		const details = doc.createElement("details");
		details.open = true;
		const summary = doc.createElement("summary");
		summary.textContent = `${item.sourceBasename} > ${item.headingText}`;
		details.appendChild(summary);
		const body = doc.createElement("div");
		body.className = "linked-content-body";
		details.appendChild(body);
		await render(item.sectionMarkdown, body);
		foldSubheadings(body);
		container.appendChild(details);
	}
}

function headingLevel(el: Element): number {
	const tag = el.tagName.toLowerCase();
	if (tag.length !== 2 || tag[0] !== "h") return 0;
	const n = parseInt(tag[1] ?? "0", 10);
	return n >= 1 && n <= 6 ? n : 0;
}

export function foldSubheadings(root: HTMLElement): void {
	const doc = root.ownerDocument;
	const children = Array.from(root.children);
	let i = 0;
	while (i < children.length) {
		const child = children[i];
		if (!child) { i++; continue; }
		const level = headingLevel(child);
		if (level === 0) { i++; continue; }

		let end = i + 1;
		while (end < children.length) {
			const sib = children[end];
			const sibLevel = sib ? headingLevel(sib) : 0;
			if (sibLevel > 0 && sibLevel <= level) break;
			end++;
		}

		const details = doc.createElement("details");
		const summary = doc.createElement("summary");
		const body = doc.createElement("div");
		body.className = "linked-content-body";
		for (let j = i + 1; j < end; j++) {
			const sib = children[j];
			if (sib) body.appendChild(sib);
		}
		// Slot the details into the heading's place, then move the heading
		// element itself into the summary so its h1/h2/... styling carries over.
		root.insertBefore(details, child);
		summary.appendChild(child);
		details.appendChild(summary);
		details.appendChild(body);

		foldSubheadings(body);
		i = end;
	}
}
