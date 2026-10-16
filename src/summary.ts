/**
 * Compact injection summaries.
 *
 * The wrapper attaches a short diagnostic summary to the tool result's OWN
 * `content` instead of injecting a separate user message, so the summary is
 * replayed once per tool result rather than accumulating as history. This
 * module is pure: it owns the text shape and the character budget, while the
 * caller owns the pi-lens reads and the per-session snapshot.
 */

/** The one line that tells the model how to pull the full diagnostic detail. */
export const PULL_HINT = '→ lens_diagnostics mode=all';

/**
 * Hard cap for the whole attachment (content lines + pull hint).
 *
 * The budget is deliberately counted over the final string rather than over
 * the content lines alone: the point of the compact path is a bounded
 * per-result cost, and a hint that escaped the budget would break that.
 */
export const MAX_ATTACHMENT_CHARS = 200;

/** Blockers listed before the `+N more` tail takes over. */
export const MAX_LISTED_BLOCKERS = 3;

/** Per-blocker message cap, so one verbose rule cannot eat the whole budget. */
const MAX_MESSAGE_CHARS = 60;

export interface BlockerLike {
	line?: number;
	message?: string;
}

export interface CompactSummaryInput {
	/** Path as shown to the model — usually workspace-relative. */
	displayPath: string;
	/** Current blocking diagnostics for the edited file. */
	blockers: BlockerLike[];
	/** `✅ Auto-fixed N issue(s)` count parsed out of the pi-lens prose. */
	fixedCount: number;
	/** `⚠️ File was modified by auto-format/fix` section present. */
	fileModified: boolean;
	/** Set when pi-lens could not complete the analysis (crash / error). */
	pipelineError?: string;
}

/**
 * Collapse a diagnostic message to one short line.
 *
 * pi-lens messages are already single-line by the time they reach widget
 * state, but a rule id or a raw LSP message can still carry tabs or repeated
 * spaces, and a very long message would crowd out the other entries.
 */
function squeeze(value: string, maxChars: number): string {
	const flat = value.replace(/\s+/g, ' ').trim();
	if (flat.length <= maxChars) return flat;
	return `${flat.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatEntry(blocker: BlockerLike): string {
	const where = typeof blocker.line === 'number' ? `L${blocker.line} ` : '';
	return `${where}${squeeze(blocker.message ?? '', MAX_MESSAGE_CHARS)}`.trim();
}

/**
 * `🔴 src/foo.ts — 3 blockers: L42 unused import; L88 missing return type`
 *
 * Entries are dropped from the tail (never the header) until the line fits
 * `maxChars`; a blocker count that no longer matches the listed entries is
 * reported as `+N more` so the model can still tell how much it is missing.
 * Returns undefined when even the bare header does not fit.
 */
export function buildBlockerLine(
	displayPath: string,
	blockers: BlockerLike[],
	maxChars: number = MAX_ATTACHMENT_CHARS,
): string | undefined {
	if (blockers.length === 0) return undefined;
	const plural = blockers.length === 1 ? 'blocker' : 'blockers';
	const head = `🔴 ${displayPath} — ${blockers.length} ${plural}: `;
	if (head.length > maxChars) return undefined;
	for (let shown = Math.min(MAX_LISTED_BLOCKERS, blockers.length); shown >= 0; shown--) {
		const entries = blockers.slice(0, shown).map(formatEntry);
		if (blockers.length > shown) entries.push(`+${blockers.length - shown} more`);
		const line = head + entries.join('; ');
		if (line.length <= maxChars) return line;
	}
	return undefined;
}

/**
 * `⚠️ auto-fixed 3, file modified — re-read`
 *
 * The re-read instruction is attached to the `file modified` fact rather than
 * to the autofix count: an autofix that did not change the file on disk (a
 * suppressed rule, an already-formatted file) must not send the model back to
 * re-read it.
 */
export function buildWarnLine(fixedCount: number, fileModified: boolean): string | undefined {
	const parts: string[] = [];
	if (fixedCount > 0) parts.push(`auto-fixed ${fixedCount}`);
	if (fileModified) parts.push('file modified');
	if (parts.length === 0) return undefined;
	return `⚠️ ${parts.join(', ')}${fileModified ? ' — re-read' : ''}`;
}

/**
 * Build the text attached to a tool result, or undefined when there is
 * nothing worth saying.
 *
 * Silence is the default: a clean edit produces no attachment at all. The pull
 * hint is emitted once per attachment even when both the blocker line and the
 * warn line are present — the two lines are two facts about the same result,
 * not two separate reports.
 */
export function buildCompactAttachment(input: CompactSummaryInput): string | undefined {
	const lines: string[] = [];

	if (input.pipelineError) {
		// A failed analysis is not a clean analysis: staying silent here would
		// let the model read "no summary" as "no problems".
		lines.push(`⚠️ pi-lens analysis failed: ${squeeze(input.pipelineError, 80)}`);
	} else {
		const warn = buildWarnLine(input.fixedCount, input.fileModified);
		const budget = MAX_ATTACHMENT_CHARS - PULL_HINT.length - 1;
		const warnCost = warn ? warn.length + 1 : 0;
		const blocker = buildBlockerLine(input.displayPath, input.blockers, budget - warnCost);
		if (blocker) lines.push(blocker);
		if (warn) lines.push(warn);
	}

	if (lines.length === 0) return undefined;
	const attachment = [...lines, PULL_HINT].join('\n');
	return attachment.length <= MAX_ATTACHMENT_CHARS ? attachment : undefined;
}

/**
 * Identity of a file's current blocker set: line numbers plus message text.
 *
 * Message text is part of the key so that fixing one blocker while introducing
 * another is not mistaken for "nothing changed" — a count-only key would see
 * `1 -> 1` and stay silent through a regression.
 */
export function blockerSnapshot(blockers: BlockerLike[]): string {
	return blockers
		.map(
			(blocker) =>
				`${typeof blocker.line === 'number' ? blocker.line : ''}:${squeeze(blocker.message ?? '', MAX_MESSAGE_CHARS)}`,
		)
		.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
		.join('|');
}

/** `✅ Auto-fixed N issue(s)` as emitted by the pi-lens pipeline. */
export function parseAutofixCount(output: string): number {
	const match = /✅ Auto-fixed (\d+) issue\(s\)/.exec(output);
	if (!match) return 0;
	const count = Number.parseInt(match[1] ?? '', 10);
	return Number.isFinite(count) && count > 0 ? count : 0;
}

/** `⚠️ **File was modified by auto-format/fix…` section presence. */
export function hasFileModifiedNotice(output: string): boolean {
	return output.includes('File was modified by auto-format/fix');
}

/** pi-lens could not finish the analysis for this result. */
export function pipelineErrorFrom(output: string): string | undefined {
	const match = /⚠️ pi-lens pipeline crashed[^\n]*/.exec(output);
	if (match) return match[0].replace(/^⚠️\s*/, '');
	return undefined;
}

/**
 * Workspace-relative display path with forward slashes, so the summary reads
 * the same on Windows and POSIX and stays short enough for the budget.
 */
export function toDisplayPath(filePath: string, root: string): string {
	const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
	const normalizedPath = filePath.replace(/\\/g, '/');
	if (
		normalizedRoot &&
		normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
	) {
		return normalizedPath.slice(normalizedRoot.length + 1);
	}
	return normalizedPath;
}

/**
 * Character budget for a turn-end finding block.
 *
 * The turn-end channel is a separate message rather than a tool-result
 * attachment, so it needs its own cap. pi-lens already caps its own turn-end
 * prose at 20 lines / 1000 chars (`runtime-config.js turnEnd`), but a
 * `lens-turn-summary` dock or a test-findings block bypasses that cap and can
 * be far longer.
 */
export const MAX_TURN_FINDINGS_CHARS = 200;

/**
 * Keep the first paragraph of a turn-end finding and cap it.
 *
 * The first paragraph carries the actionable headline (the blocking summary);
 * everything after it is detail the model can pull on demand. The paragraph
 * break is preferred over a hard slice because cutting mid-sentence loses the
 * very thing the cap exists to preserve.
 */
export function capFindings(text: string, maxChars: number = MAX_TURN_FINDINGS_CHARS): string {
	const firstParagraph = text.split(/\n\s*\n/, 1)[0]?.trim() ?? '';
	if (firstParagraph.length === 0) return text.slice(0, maxChars);
	if (firstParagraph.length <= maxChars) return firstParagraph;
	return `${firstParagraph.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
