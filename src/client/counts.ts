import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { LensFileStatus, LensStatus } from '../lens-status.js';
import { translate, type Translate } from './locales.js';

export function chipLabel(status: LensStatus, t: Translate = translate): string {
	if (!status.enabled) return t('chip.off');
	if (status.errors > 0 || status.warnings > 0) {
		return t('chip.counts', { errors: status.errors, warnings: status.warnings });
	}
	return status.files.length > 0 ? t('chip.clean') : t('chip.idle');
}

export function fileLabel(path: string): string {
	const parts = path.replace(/\\/g, '/').split('/');
	return parts.at(-1) || path;
}

export function fileKind(file: LensFileStatus): string {
	const parts = [
		file.blocking > 0 ? `${file.blocking}B` : '',
		file.errors > 0 ? `${file.errors}E` : '',
		file.warnings > 0 ? `${file.warnings}W` : '',
	].filter(Boolean);
	return parts.join(' ') || 'ok';
}

export function statusDot(status: LensStatus): StateDotState {
	if (!status.enabled) return 'warning';
	if (status.blocking > 0 || status.errors > 0) return 'error';
	if (status.warnings > 0 || status.failedLsp.length > 0) return 'warning';
	return 'done';
}

export function fileDot(file: LensFileStatus): StateDotState {
	if (file.blocking > 0 || file.errors > 0) return 'error';
	if (file.warnings > 0) return 'warning';
	return 'done';
}

export function openPath(
	openFile: ((path: string, line?: number) => void) | undefined,
	path: string,
	line?: number,
): void {
	if (openFile) {
		openFile(path, line);
		return;
	}
	if (typeof window === 'undefined') return;
	if (!isLocalFilePath(path)) return;
	// pi-lens-ignore: ast-grep:no-open-redirect
	window.open(path, '_blank', 'noopener');
}

/**
 * Guard for `window.open`: a diagnostic path is data, not a trusted URL. Accept
 * a Windows drive path, a POSIX absolute path, or a scheme-less relative path,
 * and refuse anything carrying a URL scheme (`javascript:`, `data:`, `https:`).
 */
function isLocalFilePath(path: string): boolean {
	if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
	if (/^[\\/]/.test(path)) return true;
	return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path);
}
