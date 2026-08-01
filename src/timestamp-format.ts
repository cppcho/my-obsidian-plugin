export const DEFAULT_HEADING_FORMAT = "HH:mm";

export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Moment format tokens mapped to a regex that matches anything they can render.
// Ordered longest-first so greedy tokens (YYYY) win over their prefixes (YY).
const TOKENS: Array<[string, string]> = [
	// Localized formats render locale-dependent text — match loosely.
	["LTS", "[^\\n]+?"],
	["LT", "[^\\n]+?"],
	["LLLL", "[^\\n]+?"],
	["LLL", "[^\\n]+?"],
	["LL", "[^\\n]+?"],
	["L", "[^\\n]+?"],
	["llll", "[^\\n]+?"],
	["lll", "[^\\n]+?"],
	["ll", "[^\\n]+?"],
	["l", "[^\\n]+?"],
	// Year
	["YYYY", "\\d{4}"],
	["YY", "\\d{2}"],
	["gggg", "\\d{4}"],
	["gg", "\\d{2}"],
	["GGGG", "\\d{4}"],
	["GG", "\\d{2}"],
	// Quarter
	["Qo", "\\d(?:st|nd|rd|th)"],
	["Q", "\\d"],
	// Month
	["MMMM", "\\S+"],
	["MMM", "\\S+"],
	["MM", "\\d{2}"],
	["Mo", "\\d{1,2}(?:st|nd|rd|th)"],
	["M", "\\d{1,2}"],
	// Day of year
	["DDDDo", "\\d{1,3}(?:st|nd|rd|th)"],
	["DDDD", "\\d{3}"],
	["DDDo", "\\d{1,3}(?:st|nd|rd|th)"],
	["DDD", "\\d{1,3}"],
	// Day of month
	["DD", "\\d{2}"],
	["Do", "\\d{1,2}(?:st|nd|rd|th)"],
	["D", "\\d{1,2}"],
	// Day of week
	["dddd", "\\S+"],
	["ddd", "\\S+"],
	["dd", "\\S+"],
	["do", "\\d(?:st|nd|rd|th)"],
	["d", "\\d"],
	["E", "\\d"],
	["e", "\\d"],
	// Week of year
	["wo", "\\d{1,2}(?:st|nd|rd|th)"],
	["ww", "\\d{2}"],
	["w", "\\d{1,2}"],
	["Wo", "\\d{1,2}(?:st|nd|rd|th)"],
	["WW", "\\d{2}"],
	["W", "\\d{1,2}"],
	// Hour
	["HH", "\\d{2}"],
	["H", "\\d{1,2}"],
	["hh", "\\d{2}"],
	["h", "\\d{1,2}"],
	["kk", "\\d{2}"],
	["k", "\\d{1,2}"],
	// Minute / second
	["mm", "\\d{2}"],
	["m", "\\d{1,2}"],
	["ss", "\\d{2}"],
	["s", "\\d{1,2}"],
	// Fractional second
	["SSSSSSSSS", "\\d{9}"],
	["SSSSSSSS", "\\d{8}"],
	["SSSSSSS", "\\d{7}"],
	["SSSSSS", "\\d{6}"],
	["SSSSS", "\\d{5}"],
	["SSSS", "\\d{4}"],
	["SSS", "\\d{3}"],
	["SS", "\\d{2}"],
	["S", "\\d"],
	// Meridiem
	["A", "[AP]M"],
	["a", "[ap]m"],
	// Timezone
	["ZZ", "[+-]\\d{4}"],
	["Z", "[+-]\\d{2}:\\d{2}"],
	["zz", "\\S+"],
	["z", "\\S+"],
	// Unix timestamp
	["X", "\\d+"],
	["x", "\\d+"],
];

/**
 * Builds a regex source that matches any string a moment format can render.
 * Used to recognise existing timestamp headings, so it is deliberately loose:
 * it never has to reject a value moment could not have produced.
 */
export function timestampPatternSource(format: string): string {
	const fmt = format.trim() === "" ? DEFAULT_HEADING_FORMAT : format;
	let out = "";
	let i = 0;

	while (i < fmt.length) {
		const ch = fmt.charAt(i);

		// [literal] — emitted verbatim by moment
		if (ch === "[") {
			const end = fmt.indexOf("]", i + 1);
			if (end !== -1) {
				out += escapeRegExp(fmt.slice(i + 1, end));
				i = end + 1;
				continue;
			}
		}

		// \x — escaped character
		if (ch === "\\" && i + 1 < fmt.length) {
			out += escapeRegExp(fmt.charAt(i + 1));
			i += 2;
			continue;
		}

		const token = TOKENS.find(([name]) => fmt.startsWith(name, i));
		if (token) {
			out += token[1];
			i += token[0].length;
			continue;
		}

		out += escapeRegExp(ch);
		i += 1;
	}

	return out;
}
