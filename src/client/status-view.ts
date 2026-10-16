import type { LensStatus } from '../lens-status.js';

export function readLensStatus(
	useProjection: ((key: string) => unknown) | undefined,
): LensStatus | undefined {
	if (typeof useProjection !== 'function') return undefined;
	const value = useProjection('lens');
	if (!value || typeof value !== 'object') return undefined;
	const record = value as Partial<LensStatus>;
	if (
		typeof record.visible !== 'boolean' ||
		typeof record.enabled !== 'boolean' ||
		!Array.isArray(record.files)
	)
		return undefined;
	return {
		...record,
		languages: Array.isArray(record.languages) ? record.languages : [],
		lsp: Array.isArray(record.lsp) ? record.lsp : [],
		failedLsp: Array.isArray(record.failedLsp) ? record.failedLsp : [],
	} as LensStatus;
}
