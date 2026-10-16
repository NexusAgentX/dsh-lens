/**
 * Pure wire/data shapes for the `lens` projection unit.
 *
 * Deliberately free of module augmentation: the browser half (`src/client/**`)
 * typechecks against this module on its own, so it never has to pull the
 * host-only `@deepseek-ai/dsh-session-projection` machinery into its program.
 * `src/types.ts` re-exports these and owns the SessionProjectionMap merge.
 */

export interface LensBlocker {
	path: string;
	line?: number;
	rule?: string;
	message: string;
}

export interface LensFileStatus {
	path: string;
	blocking: number;
	errors: number;
	warnings: number;
	blockers: LensBlocker[];
}

export interface LensLspStatus {
	serverId: string;
	root: string;
	connected: boolean;
}

export interface LensStatus {
	visible: boolean;
	enabled: boolean;
	languages: string[];
	blocking: number;
	errors: number;
	warnings: number;
	files: LensFileStatus[];
	failedLsp: string[];
	lsp: LensLspStatus[];
	mapPath?: string;
}

/**
 * Host fold state for the `lens` unit: the session's workspace root plus the
 * workspace-scoped snapshot. Only `status` crosses the wire — the root stays a
 * host-side detail, but it has to live in the state, because `apply()` receives
 * no session identity and would otherwise have no way to know which workspace it
 * is folding for.
 */
export interface LensFoldState {
	root?: string;
	status: LensStatus;
}
