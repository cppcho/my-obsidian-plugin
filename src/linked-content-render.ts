export interface LinkedSection {
	sourcePath: string;
	sourceBasename: string;
	headingText: string;
	headingLine: number;
	sectionMarkdown: string;
}

export type RenderFn = (markdown: string, el: HTMLElement) => Promise<void>;
export type JumpFn = (sourcePath: string, headingLine: number, ev: MouseEvent) => void;

export async function renderLinkedSections(
	container: HTMLElement,
	items: LinkedSection[],
	render: RenderFn,
	onJump?: JumpFn,
): Promise<void> {
	if (items.length === 0) return;
	const doc = container.ownerDocument;
	// Native class lets community themes style the panel like the side-pane backlinks.
	container.classList.add("search-result-container");

	const header = doc.createElement("div");
	header.className = "my-plugin-linked-notes-header";
	const title = doc.createElement("span");
	title.className = "my-plugin-linked-notes-title";
	title.textContent = "Heading-linked mentions";
	const count = doc.createElement("span");
	count.className = "my-plugin-linked-notes-count tree-item-flair";
	count.textContent = String(items.length);
	header.appendChild(title);
	header.appendChild(count);
	container.appendChild(header);

	for (const item of items) {
		const details = doc.createElement("details");
		details.className = "tree-item";
		details.open = true;
		const summary = doc.createElement("summary");
		summary.className = "tree-item-self is-clickable";
		const source = doc.createElement("a");
		source.className = "my-plugin-linked-notes-source";
		source.textContent = item.sourceBasename;
		source.setAttribute("href", "#");
		source.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			onJump?.(item.sourcePath, item.headingLine, ev);
		});
		const sep = doc.createElement("span");
		sep.className = "my-plugin-linked-notes-sep";
		sep.textContent = " > ";
		const heading = doc.createElement("span");
		heading.className = "my-plugin-linked-notes-heading";
		await renderInline(heading, item.headingText, render);
		summary.appendChild(source);
		summary.appendChild(sep);
		summary.appendChild(heading);
		details.appendChild(summary);
		const body = doc.createElement("div");
		body.className = "linked-content-body tree-item-children";
		details.appendChild(body);
		await render(item.sectionMarkdown, body);
		foldSubheadings(body);
		container.appendChild(details);
	}
}

async function renderInline(target: HTMLElement, markdown: string, render: RenderFn): Promise<void> {
	const doc = target.ownerDocument;
	const scratch = doc.createElement("div");
	await render(markdown, scratch);
	// MarkdownRenderer.render wraps content in a single <p>; unwrap it so the
	// rendered links sit inline inside the parent <summary>.
	const only = scratch.children.length === 1 ? scratch.firstElementChild : null;
	const source = only && only.tagName === "P" ? only : scratch;
	while (source.firstChild) target.appendChild(source.firstChild);
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
