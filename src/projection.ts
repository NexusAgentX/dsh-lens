import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-session-projection';
import { z } from 'zod';
import type { LensRuntime } from './runtime.js';
import { lensStatusEqual, snapshotLensStatus } from './status.js';
import type { LensFoldState } from './types.js';
import { rootFromHeader } from './workspaces.js';

const blockerSchema = z.object({
	path: z.string(),
	line: z.number().optional(),
	rule: z.string().optional(),
	message: z.string(),
});

const fileSchema = z.object({
	path: z.string(),
	blocking: z.number(),
	errors: z.number(),
	warnings: z.number(),
	blockers: z.array(blockerSchema),
});

const lensSchema = z.object({
	visible: z.boolean(),
	enabled: z.boolean(),
	languages: z.array(z.string()),
	blocking: z.number(),
	errors: z.number(),
	warnings: z.number(),
	files: z.array(fileSchema),
	failedLsp: z.array(z.string()),
	lsp: z.array(
		z.object({
			serverId: z.string(),
			root: z.string(),
			connected: z.boolean(),
		}),
	),
	mapPath: z.string().optional(),
});

/** Fold-state validator: the workspace root plus the scoped snapshot. */
const lensFoldSchema = z.object({
	root: z.string().optional(),
	status: lensSchema,
});

const REFRESH_EVENTS = new Set([
	'tool/result',
	'turn/end',
	'turn/start',
	'command/done',
	'command/run',
	'session/start',
	'workspace/open',
]);

export function registerLensProjection(ctx: Context, state: LensRuntime): void {
	ctx.inject(['sessionProjections'], (projectionCtx) => {
		projectionCtx.sessionProjections.register<'lens', LensFoldState>({
			key: 'lens',
			// The persisted fold is wider than the wire view: it also carries the
			// workspace root, so state and view need separate validators.
			stateSchema: lensFoldSchema,
			// The session header pins one workspace, so the fold is scoped from the
			// very first paint instead of showing every open workspace's files.
			init: (header) => {
				const root = rootFromHeader(header);
				return {
					root,
					status: snapshotLensStatus(state.flags, {
						mapPath: state.lastMapPath,
						root,
					}),
				};
			},
			apply: (current, event) => {
				if (!REFRESH_EVENTS.has(event.type)) return current;
				const next = snapshotLensStatus(state.flags, {
					mapPath: state.lastMapPath,
					root: current.root,
				});
				// Returning the same reference suppresses downstream work: the runtime
				// compares view results with Object.is.
				return lensStatusEqual(current.status, next)
					? current
					: { root: current.root, status: next };
			},
			// A client-visible unit MUST declare `wire`, and the view must return a
			// stable reference while only internal state changes: `view` hands the
			// runtime `state.status`, not the fold, so an unchanged snapshot publishes
			// nothing.
			wire: {
				viewSchema: lensSchema,
				view: (value) => value.status,
			},
			stateVersion: 3,
		});
	});
}
