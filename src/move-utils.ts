export const FRAGMENTS_FOLDER = "fragments";
const DAILY_FOLDER = "daily";

export function getFragmentTargetPath(currentPath: string): string | null {
	if (currentPath.startsWith(`${FRAGMENTS_FOLDER}/`)) return null;
	if (currentPath.startsWith(`${DAILY_FOLDER}/`)) return null;

	const slash = currentPath.lastIndexOf("/");
	const basename = slash === -1 ? currentPath : currentPath.slice(slash + 1);

	const match = /^\d{4}(\d{2})(\d{2})(?!\d)/.exec(basename);
	if (!match) return null;

	const month = parseInt(match[1]!, 10);
	const day = parseInt(match[2]!, 10);
	if (month < 1 || month > 12) return null;
	if (day < 1 || day > 31) return null;

	return `${FRAGMENTS_FOLDER}/${basename}`;
}
