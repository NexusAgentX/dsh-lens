/**
 * Workspace-root algebra shared by the host fold and the client view.
 *
 * pi-lens reports absolute file paths and DSH records an absolute session cwd,
 * but the two can disagree on separator style and drive-letter case, so every
 * comparison normalizes both sides first. An absent or empty root means "no
 * workspace scoping": callers get every file, which is also the safe fallback
 * when a session header carries no cwd.
 */

/** One pi-lens widget-state entry, structurally typed so this module stays dependency-free. */
export interface RootScopedFile {
	filePath: string;
	touchedAt?: number;
}

/**
 * The session's workspace root, or `undefined` when the header does not pin one
 * (older sessions, subagent children built without `meta.cwd`).
 */
export function rootFromHeader(header: { cwd?: unknown } | undefined): string | undefined {
	const cwd = header?.cwd;
	return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined;
}

/** Lowercased, forward-slashed, trailing-separator-free form used for every comparison. */
export function normalizeRoot(root: string | undefined): string {
	if (typeof root !== 'string') return '';
	return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * True when `filePath` is `root` itself or lives underneath it. A sibling whose
 * name merely shares a prefix (`/work/proj-other` vs `/work/proj`) does not match,
 * which is why the comparison appends a separator instead of using a bare prefix.
 */
export function isWithinRoot(root: string | undefined, filePath: string): boolean {
	const base = normalizeRoot(root);
	if (!base) return true;
	const candidate = normalizeRoot(filePath);
	return candidate === base || candidate.startsWith(`${base}/`);
}

/**
 * Newest-first ordering restricted to one workspace. Ordering happens before the
 * caller's `MAX_FILES` cap so that a busy second workspace cannot push the first
 * workspace's files out of its own list.
 */
export function rankWorkspaceFiles<T extends RootScopedFile>(
	files: readonly T[],
	root: string | undefined,
): T[] {
	const ranked = [...files].sort((left, right) => (right.touchedAt ?? 0) - (left.touchedAt ?? 0));
	if (!normalizeRoot(root)) return ranked;
	return ranked.filter((file) => isWithinRoot(root, file.filePath));
}
