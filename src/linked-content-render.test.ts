// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderLinkedSections, foldSubheadings, LinkedSection } from "./linked-content-render";

function fakeRender(): (markdown: string, el: HTMLElement) => Promise<void> {
	return vi.fn((markdown: string, el: HTMLElement) => {
		// Naive markdown-to-HTML stub that handles `# heading` and plain paragraphs.
		const lines = markdown.split("\n");
		for (const line of lines) {
			const m = /^(#{1,6})\s+(.*)$/.exec(line);
			if (m && m[1] && m[2]) {
				const h = el.ownerDocument.createElement("h" + String(m[1].length));
				h.textContent = m[2];
				el.appendChild(h);
			} else if (line.trim()) {
				const p = el.ownerDocument.createElement("p");
				p.textContent = line;
				el.appendChild(p);
			}
		}
		return Promise.resolve();
	});
}

describe("renderLinkedSections", () => {
	it("appends a wrapper with one <details> per item, summary labeled <basename> > <heading>", async () => {
		const container = document.createElement("div");
		const items: LinkedSection[] = [
			{
				sourcePath: "daily/2026-05-04.md",
				sourceBasename: "2026-05-04",
				headingText: "09:30 [[topics/React]]",
				sectionMarkdown: "content X",
			},
		];
		await renderLinkedSections(container, items, fakeRender());

		const details = container.querySelectorAll("details");
		expect(details).toHaveLength(1);
		expect(details[0]?.querySelector("summary")?.textContent).toBe("2026-05-04 > 09:30 [[topics/React]]");
	});

	it("emits no children when items is empty", async () => {
		const container = document.createElement("div");
		await renderLinkedSections(container, [], fakeRender());
		expect(container.children).toHaveLength(0);
	});

	it("renders the section markdown body inside each details", async () => {
		const container = document.createElement("div");
		const items: LinkedSection[] = [
			{
				sourcePath: "daily/2026-05-04.md",
				sourceBasename: "2026-05-04",
				headingText: "09:30",
				sectionMarkdown: "hello world",
			},
		];
		await renderLinkedSections(container, items, fakeRender());

		const body = container.querySelector("details > .linked-content-body");
		expect(body).not.toBeNull();
		expect(body?.querySelector("p")?.textContent).toBe("hello world");
	});
});

describe("foldSubheadings", () => {
	it("wraps each heading + following content into a closed <details>", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<p>intro</p>
			<h4>sub one</h4>
			<p>body one</p>
			<ul><li>item</li></ul>
			<h4>sub two</h4>
			<p>body two</p>
		`;
		foldSubheadings(root);

		const folds = root.querySelectorAll(":scope > details");
		expect(folds).toHaveLength(2);
		expect(folds[0]?.querySelector("summary")?.textContent).toBe("sub one");
		expect(folds[0]?.hasAttribute("open")).toBe(false);
		// First fold should have absorbed the <p> and <ul> after the heading
		expect(folds[0]?.querySelectorAll("p").length).toBe(1);
		expect(folds[0]?.querySelector("ul")).not.toBeNull();
		expect(folds[1]?.querySelector("summary")?.textContent).toBe("sub two");
	});

	it("leaves intro content above the first heading in place", () => {
		const root = document.createElement("div");
		root.innerHTML = `<p class="intro">intro</p><h4>sub</h4><p>body</p>`;
		foldSubheadings(root);

		expect(root.querySelector(":scope > p.intro")?.textContent).toBe("intro");
		expect(root.querySelectorAll(":scope > details")).toHaveLength(1);
	});

	it("does nothing when there are no subheadings", () => {
		const root = document.createElement("div");
		root.innerHTML = `<p>only paragraph</p>`;
		foldSubheadings(root);
		expect(root.querySelectorAll("details")).toHaveLength(0);
		expect(root.querySelector("p")?.textContent).toBe("only paragraph");
	});

	it("preserves the original heading element inside the summary", () => {
		const root = document.createElement("div");
		root.innerHTML = `<h2>sub two</h2><p>body</p><h4>deeper</h4><p>more</p>`;
		foldSubheadings(root);

		const outer = root.querySelector(":scope > details > summary");
		expect(outer?.querySelector("h2")).not.toBeNull();
		expect(outer?.querySelector("h2")?.textContent).toBe("sub two");

		const inner = root.querySelector(":scope > details > .linked-content-body > details > summary");
		expect(inner?.querySelector("h4")).not.toBeNull();
		expect(inner?.querySelector("h4")?.textContent).toBe("deeper");
	});

	it("nests deeper headings inside their parent fold", () => {
		const root = document.createElement("div");
		root.innerHTML = `
			<h3>parent</h3>
			<p>p1</p>
			<h4>child</h4>
			<p>c1</p>
			<h3>sibling</h3>
			<p>s1</p>
		`;
		foldSubheadings(root);

		const top = root.querySelectorAll(":scope > details");
		expect(top).toHaveLength(2);
		expect(top[0]?.querySelector("summary")?.textContent).toBe("parent");
		const nested = top[0]?.querySelectorAll(":scope > .linked-content-body > details");
		expect(nested?.length).toBe(1);
		expect(nested?.[0]?.querySelector("summary")?.textContent).toBe("child");
	});
});
