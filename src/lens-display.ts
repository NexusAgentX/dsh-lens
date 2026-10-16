/**
 * Framework-free display logic for the WebUI lens pill.
 *
 * It lives outside `src/client/**` on purpose: `tsconfig.json` excludes that
 * directory, so anything under it can never be covered by `node --test
 * dist/test/*.test.js`. Nothing here may import a host-only module — the
 * browser bundle pulls this file in.
 */

import type { LensStatus } from './lens-status.js';

/** The pi-lens tiers plus the "other issues" bucket, in display order. */
export type LensPillTier = 'blocking' | 'errors' | 'warnings' | 'failedLsp';

export interface LensPillCount {
	tier: LensPillTier;
	count: number;
	/** Compact tier text, e.g. `3E`. */
	text: string;
}

export type LensPillState =
	| { kind: 'off' }
	| { kind: 'idle' }
	| { kind: 'clean' }
	| { kind: 'counts'; counts: LensPillCount[] };

/**
 * Collapse a lens snapshot into what the pill shows.
 *
 * `clean` is deliberately distinct from `idle`. pi-lens renders "analyzed and
 * found nothing" as a checkmark, but the pill must never claim cleanliness
 * before anything has been analyzed: the startup heavy scans (knip, jscpd)
 * persist into the cache manager rather than the widget store, so an all-zero
 * snapshot with no analyzed files is absence of evidence, not evidence of clean.
 */
export function lensPillState(status: LensStatus): LensPillState {
	if (!status.visible || !status.enabled) return { kind: 'off' };

	const counts: LensPillCount[] = [];
	if (status.blocking > 0)
		counts.push({ tier: 'blocking', count: status.blocking, text: `${status.blocking}B` });
	if (status.errors > 0)
		counts.push({ tier: 'errors', count: status.errors, text: `${status.errors}E` });
	if (status.warnings > 0)
		counts.push({ tier: 'warnings', count: status.warnings, text: `${status.warnings}W` });
	if (status.failedLsp.length > 0) {
		counts.push({
			tier: 'failedLsp',
			count: status.failedLsp.length,
			text: `${status.failedLsp.length}LSP`,
		});
	}
	if (counts.length > 0) return { kind: 'counts', counts };

	return status.files.length > 0 ? { kind: 'clean' } : { kind: 'idle' };
}
