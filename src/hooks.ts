import path from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-tools';
import { getFormatService, resetFormatService } from 'pi-lens/dist/clients/format-service.js';
import { resetLSPService } from 'pi-lens/dist/clients/lsp/index.js';
import { handleAgentEnd } from 'pi-lens/dist/clients/runtime-agent-end.js';
import {
	consumeSessionStartGuidance,
	consumeTestFindings,
	consumeTurnEndFindings,
} from 'pi-lens/dist/clients/runtime-context.js';
import { handleToolCall } from 'pi-lens/dist/clients/runtime-tool-call.js';
import { handleToolResult } from 'pi-lens/dist/clients/runtime-tool-result.js';
import { handleTurnEnd } from 'pi-lens/dist/clients/runtime-turn.js';
import { getFileDiagnostics } from 'pi-lens/dist/clients/widget-state.js';
import { lensNotice, sessionCwd } from './context.js';
import {
	extractResultText,
	joinFindingMessages,
	MUTATION_TOOLS,
	normalizeToolEvent,
	OBSERVED_TOOLS,
} from './events.js';
import { logger } from './logger.js';
import { analyzeWorkspace, ensureLspConfig, type LensRuntime } from './runtime.js';
import {
	blockerSnapshot,
	buildCompactAttachment,
	capFindings,
	hasFileModifiedNotice,
	parseAutofixCount,
	pipelineErrorFrom,
	toDisplayPath,
	type BlockerLike,
} from './summary.js';

interface AgentLike {
	inject?(message: unknown): void;
	session?: { id?: string; header?: { cwd?: string } };
}

interface WidgetDiagnostic {
	semantic?: string;
	severity?: string;
	line?: number;
	message?: string;
}

/**
 * pi-lens' own blocking predicate.
 *
 * `isBlocking` is module-private in `pi-lens/dist/clients/widget-state.js` and
 * `src/status.ts` carries an equivalent copy; this is the third call site and
 * it must agree with the other two, so the rule is restated rather than
 * loosened: an explicit `blocking` semantic wins, and only a diagnostic with
 * NO semantic falls back to `severity === 'error'`.
 */
function isBlockingDiagnostic(diagnostic: WidgetDiagnostic): boolean {
	if (diagnostic.semantic === 'blocking') return true;
	return diagnostic.semantic == null && diagnostic.severity === 'error';
}

/**
 * Current blocking diagnostics for one absolute path.
 *
 * `getFileDiagnostics` returns `undefined` for a file pi-lens has never
 * recorded and an array (possibly empty) for one it has — the two must not be
 * conflated, but here both mean "nothing to report", so a miss degrades to an
 * empty list. The read is deliberately fail-open: a widget-state problem must
 * not turn a successful edit into an error.
 */
function readFileBlockers(absolutePath: string): BlockerLike[] {
	try {
		const diagnostics = getFileDiagnostics(absolutePath) as WidgetDiagnostic[] | undefined;
		if (!Array.isArray(diagnostics)) return [];
		return diagnostics.filter(isBlockingDiagnostic).map((diagnostic) => ({
			...(typeof diagnostic.line === 'number' ? { line: diagnostic.line } : {}),
			message: diagnostic.message ?? '',
		}));
	} catch (error) {
		logger.debug(
			`widget-state read failed for ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * The tool result's own rendered content as a single string.
 *
 * In compact mode this — not the raw `result.value` — is what gets handed back
 * to pi-lens. For write/edit `value` carries the whole `before`/`after` file
 * bodies, so passing it would re-introduce exactly the echo this mode exists
 * to remove.
 */
function renderedContentText(result: any): string {
	const blocks = Array.isArray(result?.content) ? result.content : [];
	const text = blocks
		.map((block: any) => (typeof block?.text === 'string' ? block.text : ''))
		.filter(Boolean)
		.join('\n');
	return text || extractResultText(result?.value ?? result);
}

export function registerLifecycle(ctx: Context, state: LensRuntime): void {
	ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<any>) => {
		if (!state.flags.enabled || !OBSERVED_TOOLS.has(exec.name)) return next();
		const cwd = sessionCwd(exec.agent, state.projectRoot);
		await analyzeWorkspace(state, cwd);
		const event = normalizeToolEvent(exec.name, exec.arguments);
		try {
			const decision = await handleToolCall({
				event,
				ctx: { cwd },
				lensEnabled: state.flags.enabled,
				getFlag: state.getFlag,
				dbg: (message: string) => logger.debug(message),
				runtime: state.runtime,
				cacheManager: state.cacheManager,
				ensureLSPConfigInitialized: (root: string) => ensureLspConfig(state, root),
				updateLspStatus: () => undefined,
				resetLSPService,
			});
			if (decision && decision.block) {
				return {
					kind: 'deny',
					reason: decision.reason ?? 'blocked by dsh-lens',
				};
			}
		} catch (error) {
			logger.warn(
				`tool_call hook failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return next();
	});

	// `prepend` puts dsh-lens at the OUTER edge of the waterfall: `next()` runs
	// every other listener (spill-policy, sol-pi, …) and the decision returned
	// here is what the harness applies last. That matters for the compact path —
	// it appends to `downstream.content`, so it must see the final content, and
	// its ~200-char addition must not be handed back to spill-policy as fresh
	// inline output.
	ctx.on(
		'tools/post-execute',
		async (exec: any, result: any, next: () => Promise<any>) => {
			const downstream = await next();
			if (!state.flags.enabled || !OBSERVED_TOOLS.has(exec.name)) return downstream;
			await state.started;
			const event = normalizeToolEvent(exec.name, exec.arguments);
			const compact = state.flags.compactInjection && state.flags.contextInjection;
			const mutation = MUTATION_TOOLS.has(exec.name);
			// The legacy path feeds pi-lens the serialized result value (whole file
			// bodies included) because its echoed block is the injected payload.
			// The compact path has no use for that echo and passes the rendered
			// content instead.
			const eventContent = [
				{
					type: 'text',
					text:
						compact && mutation
							? renderedContentText(result)
							: extractResultText(result?.value ?? result),
				},
			];
			let full = '';
			let appended = '';
			try {
				const updated = await handleToolResult({
					event: {
						...event,
						isError: Boolean(result?.isError),
						content: eventContent,
						sessionId: exec.agent?.session?.id,
					},
					getFlag: state.getFlag,
					dbg: (message: string) => logger.debug(message),
					runtime: state.runtime,
					cacheManager: state.cacheManager,
					biomeClient: state.clients.biomeClient,
					ruffClient: state.clients.ruffClient,
					metricsClient: state.clients.metricsClient,
					resetLSPService,
					readGuard: state.runtime.readGuard,
					agentBehaviorRecord: (toolName: string, filePath?: string) => {
						const client = state.clients.agentBehaviorClient as
							| { recordToolCall?: (name: string, path?: string) => unknown[] }
							| undefined;
						return client?.recordToolCall?.(toolName, filePath) ?? [];
					},
					formatBehaviorWarnings: (warnings: unknown[]) => {
						const client = state.clients.agentBehaviorClient as
							| { formatWarnings?: (items: unknown[]) => string }
							| undefined;
						return client?.formatWarnings?.(warnings) ?? '';
					},
					sessionId: exec.agent?.session?.id,
				});
				const blocks = updated?.content ?? [];
				const texts = blocks.map((block: any) => block.text ?? '').filter(Boolean);
				full = texts.join('\n');
				// pi-lens appends its findings after the input it was given, so
				// dropping the first `eventContent.length` blocks leaves only the
				// diagnostics — the echo is not a finding.
				appended = texts.slice(eventContent.length).join('\n');
			} catch (error) {
				logger.warn(
					`tool_result hook failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			if (compact) {
				// Only a mutation has a diagnostic story to tell. read/bash/grep/glob
				// results must reach the model byte-for-byte as the tool rendered
				// them: pi-lens itself early-returns for anything but write/edit
				// (`runtime-tool-result.js:231-234`), and a bash result is the one
				// input its read-guard actually parses.
				return mutation
					? attachCompactSummary(state, exec, result, downstream, appended)
					: downstream;
			}

			if (!full || !state.flags.contextInjection) return downstream;
			const notice = lensNotice(full, `${exec.name} diagnostics`);
			return {
				...downstream,
				additionalContexts: [notice, ...(downstream.additionalContexts ?? [])],
			};
		},
		{ prepend: true },
	);

	// `agent/created` is the live agent-lifecycle edge for a fresh session, resume,
	// clear, or compaction (payload = { agent, source, signal }). The previous
	// `agent/session-start` name does not exist in the Events surface, so this
	// bootstrap never ran at all.
	ctx.on('agent/created', (payload: { agent: AgentLike }) => {
		if (!state.flags.enabled) return undefined;
		const { agent } = payload;
		return (async (): Promise<undefined> => {
			const cwd = sessionCwd(agent, state.projectRoot);
			await analyzeWorkspace(state, cwd);
			if (!state.flags.contextInjection) return undefined;
			const guidance = joinFindingMessages(consumeSessionStartGuidance(state.cacheManager, cwd));
			if (guidance) inject(agent, guidance, 'session start');
			return undefined;
		})();
	});

	ctx.on('agent/turn-stopping', async (payload: { agent: AgentLike }) => {
		if (!state.flags.enabled) return;
		await state.started;
		const cwd = sessionCwd(payload.agent, state.projectRoot);
		try {
			await handleTurnEnd({
				ctxCwd: cwd,
				getFlag: state.getFlag,
				dbg: (message: string) => logger.debug(message),
				runtime: state.runtime,
				cacheManager: state.cacheManager,
				knipClient: state.clients.knipClient,
				deadCodeClients: state.clients.deadCodeClients,
				depChecker: state.clients.depChecker,
				testRunnerClient: state.clients.testRunnerClient,
				resetLSPService,
				resetFormatService,
			});
		} catch (error) {
			logger.warn(
				`turn_end hook failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}
		if (!state.flags.contextInjection) return;
		const compact = state.flags.compactInjection;
		// Turn-end findings are the one channel that cannot ride on a tool
		// result: dead-code, call-graph impact and test results only exist once
		// the whole turn is over. They stay a separate message, but each block is
		// capped to its headline paragraph so the message cannot grow without
		// bound the way the tool-result echo used to.
		const findings = [
			joinFindingMessages(consumeTurnEndFindings(state.cacheManager, cwd)),
			joinFindingMessages(consumeTestFindings(state.cacheManager, cwd)),
		]
			.filter((text): text is string => Boolean(text))
			.map((text) => (compact ? capFindings(text) : text))
			.filter((text) => text.length > 0);
		if (state.getFlag('lens-turn-summary') === true) {
			const { formatLensDock, snapshotLensStatus } = await import('./status.js');
			// The opt-in dock is a status panel, not a finding, so it is exempt
			// from the per-finding cap.
			findings.push(
				formatLensDock(snapshotLensStatus(state.flags, { mapPath: state.lastMapPath }), {
					compact: state.flags.compactInjection,
				}),
			);
		}
		for (const text of findings) inject(payload.agent, text, 'turn findings');
	});

	ctx.on('agent/status', async (payload: { agent: AgentLike; status: string }) => {
		if (payload.status !== 'idle' || !state.flags.enabled) return;
		await state.started;
		try {
			await handleAgentEnd({
				ctxCwd: sessionCwd(payload.agent, state.projectRoot),
				getFlag: state.getFlag,
				notify: (message: string) => logger.info(message),
				dbg: (message: string) => logger.debug(message),
				runtime: state.runtime,
				cacheManager: state.cacheManager,
				getFormatService,
				currentSessionId: payload.agent.session?.id,
			});
		} catch (error) {
			logger.debug(
				`agent_end hook failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});
}

/**
 * Attach a bounded diagnostic summary to the tool result's own content.
 *
 * Everything here is a reason to stay silent and return `downstream`
 * untouched: a failed tool call (its error is already the message), a blocked
 * call (blocks carry `feedback`, not `content`), a decision that replaced the
 * result wholesale with a `value`, or a file with nothing worth saying. The
 * one thing that is never silent is `fileModified` — a file rewritten under
 * the model's feet is a correctness fact, not a suggestion.
 */
export function attachCompactSummary(
	state: LensRuntime,
	exec: any,
	result: any,
	downstream: any,
	appended: string,
): any {
	if (downstream?.kind === 'block') return downstream;
	if (result?.isError) return downstream;
	// `content` and `value` are mutually exclusive on an accept decision; adding
	// `content` where `value` is already present makes the harness throw.
	if (Object.hasOwn(downstream ?? {}, 'value')) return downstream;

	const root = state.runtime.projectRoot || state.projectRoot;
	const rawPath = exec?.arguments?.file_path ?? exec?.arguments?.path ?? exec?.arguments?.filePath;
	if (typeof rawPath !== 'string' || rawPath.length === 0) return downstream;
	const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);

	const blockers = readFileBlockers(absolutePath);
	const snapshot = blockerSnapshot(blockers);
	if (snapshot === state.reportedSnapshots.get(absolutePath)) {
		// The same blockers were already reported for this file; repeating them
		// on every keystroke is what made the old channel noise. The warn line
		// below is exempt — it reports a new disk state, not a known problem.
		blockers.length = 0;
	}
	if (snapshot.length > 0) state.reportedSnapshots.set(absolutePath, snapshot);

	const attachment = buildCompactAttachment({
		displayPath: toDisplayPath(absolutePath, root),
		blockers,
		fixedCount: parseAutofixCount(appended),
		fileModified: hasFileModifiedNotice(appended),
		pipelineError: pipelineErrorFrom(appended),
	});
	if (!attachment) return downstream;

	const baseContent = Object.hasOwn(downstream ?? {}, 'content')
		? downstream.content
		: result?.content;
	const content = [
		...(Array.isArray(baseContent) ? baseContent : []),
		{ type: 'text', text: attachment },
	];
	return { ...downstream, content };
}

function inject(agent: AgentLike, text: string, summary: string): void {
	try {
		agent.inject?.(lensNotice(text, summary));
	} catch (error) {
		logger.debug(`inject failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
