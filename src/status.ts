import { selectLspStatus } from 'pi-lens/dist/clients/lsp-status.js';
import { getLSPService } from 'pi-lens/dist/clients/lsp/index.js';
import {
	exportWidgetState,
	getFailedLspServerIds,
	getSessionLanguages,
} from 'pi-lens/dist/clients/widget-state.js';
import type { LensFlags } from './host.js';
import type { LensBlocker, LensFileStatus, LensLspStatus, LensStatus } from './types.js';
import { rankWorkspaceFiles } from './workspaces.js';

const MAX_FILES = 8;
const MAX_BLOCKERS_PER_FILE = 3;

interface WidgetDiagnostic {
	semantic?: string;
	severity?: string;
	line?: number;
	rule?: string;
	message?: string;
}

interface WidgetFile {
	filePath: string;
	touchedAt?: number;
	diagnosticCounts?: { blocking?: number; errors?: number; warnings?: number };
	allDiagnostics?: WidgetDiagnostic[];
	diagnostics?: WidgetDiagnostic[];
}

function isBlocking(diagnostic: WidgetDiagnostic): boolean {
	if (diagnostic.semantic === 'blocking') return true;
	return diagnostic.semantic == null && diagnostic.severity === 'error';
}

function basename(filePath: string): string {
	const parts = filePath.replace(/\\/g, '/').split('/');
	return parts.at(-1) || filePath;
}

export function emptyLensStatus(
	flags: Pick<LensFlags, 'enabled' | 'widgetVisible'>,
	extras: { mapPath?: string } = {},
): LensStatus {
	return {
		visible: flags.widgetVisible,
		enabled: flags.enabled,
		languages: [],
		blocking: 0,
		errors: 0,
		warnings: 0,
		files: [],
		failedLsp: [],
		lsp: [],
		...(extras.mapPath ? { mapPath: extras.mapPath } : {}),
	};
}

/**
 * The pi-lens widget registry is process-global: every workspace this host has
 * analysed contributes entries. `extras.root` scopes the result to one session's
 * workspace, and the scoping happens *before* the MAX_FILES cap so a busy second
 * workspace cannot push this one's files out of its own list. An absent root
 * means "no scoping" — every file, which is also the fallback for a session whose
 * header carries no cwd.
 */
export function snapshotLensStatus(
	flags: Pick<LensFlags, 'enabled' | 'widgetVisible'>,
	extras: { mapPath?: string; root?: string } = {},
): LensStatus {
	const widget = exportWidgetState() as { files?: WidgetFile[] };
	const ranked = rankWorkspaceFiles(widget.files ?? [], extras.root);

	const files: LensFileStatus[] = ranked.map((file) => {
		const diagnostics = file.allDiagnostics ?? file.diagnostics ?? [];
		const blockers: LensBlocker[] = diagnostics
			.filter(isBlocking)
			.slice(0, MAX_BLOCKERS_PER_FILE)
			.map((diagnostic) => ({
				path: file.filePath,
				...(typeof diagnostic.line === 'number' ? { line: diagnostic.line } : {}),
				...(diagnostic.rule ? { rule: diagnostic.rule } : {}),
				message: diagnostic.message ?? '',
			}));
		return {
			path: file.filePath,
			blocking: file.diagnosticCounts?.blocking ?? blockers.length,
			errors: file.diagnosticCounts?.errors ?? 0,
			warnings: file.diagnosticCounts?.warnings ?? 0,
			blockers,
		};
	});

	const lsp = (getLSPService().getStatus() as LensLspStatus[]).map((item) => ({
		serverId: item.serverId,
		root: item.root,
		connected: Boolean(item.connected),
	}));
	return {
		visible: flags.widgetVisible,
		enabled: flags.enabled,
		languages: getSessionLanguages().slice(0, 6),
		blocking: files.reduce((sum, file) => sum + file.blocking, 0),
		errors: files.reduce((sum, file) => sum + file.errors, 0),
		warnings: files.reduce((sum, file) => sum + file.warnings, 0),
		files: files.slice(0, MAX_FILES),
		failedLsp: selectFailedLsp(),
		lsp,
		...(extras.mapPath ? { mapPath: extras.mapPath } : {}),
	};
}

/**
 * pi-lens exposes `getFailedLspServerIds()` raw: it is a list of *failed spawn
 * records*, which over-reports in two ways its own doc comment delegates to a
 * sibling. `selectLspStatus` is that sibling — the policy pi-lens' own footer
 * uses. It drops a failure when an alive language server already covers the same
 * extensions, and drops a failure for a language no longer in use this session.
 * A record for a server whose spawn later succeeded is not removed from
 * `lspServers`, nor is a cold-launch timeout — the timeout is deliberately
 * reported as `failureKind: "success"` by pi-lens — so a raw read shows an
 * `LSP` count on a session whose servers are demonstrably alive.
 */
function selectFailedLsp(): string[] {
	const languages = getSessionLanguages();
	try {
		const service = getLSPService();
		const alive =
			typeof service.getAliveServerIds === 'function' ? service.getAliveServerIds() : [];
		return selectLspStatus(alive, getFailedLspServerIds(), languages).failedIds;
	} catch {
		return getFailedLspServerIds();
	}
}

export function lensStatusEqual(left: LensStatus | null, right: LensStatus): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function formatLensChip(status: LensStatus): string {
	if (!status.enabled) return 'lens off';
	const parts: string[] = [];
	if (status.errors > 0) parts.push(`${status.errors}E`);
	if (status.warnings > 0) parts.push(`${status.warnings}W`);
	if (parts.length === 0) return status.files.length > 0 ? 'lens clean' : 'lens';
	return `lens ${parts.join(' ')}`;
}

export function formatLensDock(status: LensStatus, extras: { compact?: boolean } = {}): string {
	const header = formatLensChip(status);
	const langs = status.languages.length > 0 ? ` · ${status.languages.join(' ')}` : '';
	// `compact` is a wrapper-level switch, not part of the pi-lens snapshot, so
	// it is passed in rather than derived — the dock is where a user can see at
	// a glance which injection shape the session is actually using.
	const mode = extras.compact === undefined ? '' : ` · compact ${extras.compact ? 'on' : 'off'}`;
	const files = status.files.slice(0, 4).map((file) => {
		const counts = [
			file.blocking > 0 ? `${file.blocking}B` : '',
			file.errors > 0 ? `${file.errors}E` : '',
			file.warnings > 0 ? `${file.warnings}W` : '',
		]
			.filter(Boolean)
			.join(' ');
		return `${basename(file.path)}${counts ? ` ${counts}` : ''}`;
	});
	const failed = status.failedLsp.length > 0 ? ` · LSP failed: ${status.failedLsp.join(' ')}` : '';
	return [header + langs + mode + failed, ...files].join('\n');
}
