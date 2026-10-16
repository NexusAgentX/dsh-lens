import { AstGrepClient } from 'pi-lens/dist/clients/ast-grep-client.js';
import { loadBootstrapClients } from 'pi-lens/dist/clients/bootstrap.js';
import { CacheManager } from 'pi-lens/dist/clients/cache-manager.js';
import { resetDispatchBaselines } from 'pi-lens/dist/clients/dispatch/integration.js';
import { resetFormatService } from 'pi-lens/dist/clients/format-service.js';
import { ensureTool } from 'pi-lens/dist/clients/installer/index.js';
import { initLSPConfig } from 'pi-lens/dist/clients/lsp/config.js';
import { resetLSPService } from 'pi-lens/dist/clients/lsp/index.js';
import { RuntimeCoordinator } from 'pi-lens/dist/clients/runtime-coordinator.js';
import { handleSessionStart } from 'pi-lens/dist/clients/runtime-session.js';
import { createFlagResolver, type LensFlags } from './host.js';
import { logger } from './logger.js';
import { normalizeRoot } from './workspaces.js';

export interface LensRuntime {
	projectRoot: string;
	flags: LensFlags;
	runtime: RuntimeCoordinator;
	cacheManager: CacheManager;
	astGrepClient: AstGrepClient;
	clients: Record<string, any>;
	getFlag: (name: string, filePath?: string) => boolean | string | undefined;
	started: Promise<void>;
	lastMapPath?: string;
	/** Last session workspace seen on a tool/hook call. */
	sessionCwd?: string;
	/**
	 * Normalized roots already announced once. Workspace switching re-enters
	 * `startSession` on every return visit (the bootstrap is not cached), so the
	 * announcement is deduplicated per root instead of printed per switch.
	 */
	announcedRoots: Set<string>;
	/**
	 * Last blocker snapshot reported per absolute file path, so an unchanged
	 * blocker set is not re-attached to every subsequent edit of that file.
	 * Session memory only — it is deliberately not persisted: a fresh session
	 * should re-state the current problems once.
	 */
	reportedSnapshots: Map<string, string>;
}

export interface RuntimeOptions {
	cwd?: string;
	enabled?: boolean;
	contextInjection?: boolean;
	/** Bounded diagnostic summaries attached to tool results instead of messages. */
	compactInjection?: boolean;
	flagOverrides?: Record<string, boolean | string | undefined>;
}

export function createRuntime(options: RuntimeOptions = {}): LensRuntime {
	const projectRoot = options.cwd ?? process.cwd();
	const flags: LensFlags = {
		enabled: options.enabled !== false,
		contextInjection: options.contextInjection !== false,
		compactInjection: options.compactInjection !== false,
		widgetVisible: true,
	};
	const coordinator = new RuntimeCoordinator();
	coordinator.projectRoot = projectRoot;
	const cacheManager = new CacheManager();
	const astGrepClient = new AstGrepClient();
	const getFlag = createFlagResolver(projectRoot, flags, options.flagOverrides);

	const state: LensRuntime = {
		projectRoot,
		flags,
		runtime: coordinator,
		cacheManager,
		astGrepClient,
		clients: {},
		getFlag,
		started: Promise.resolve(),
		sessionCwd: projectRoot,
		announcedRoots: new Set<string>(),
		reportedSnapshots: new Map<string, string>(),
	};

	state.started = startSession(state, projectRoot);
	return state;
}

export async function analyzeWorkspace(state: LensRuntime, cwd: string): Promise<void> {
	const resolvedCwd = cwd || state.projectRoot;
	if (resolvedCwd === state.projectRoot && state.sessionCwd === resolvedCwd) {
		await state.started;
		return;
	}
	state.projectRoot = resolvedCwd;
	state.sessionCwd = resolvedCwd;
	state.started = state.started.then(() => startSession(state, resolvedCwd));
	await state.started;
}

async function startSession(state: LensRuntime, cwd: string): Promise<void> {
	state.runtime.projectRoot = cwd;
	const clientsStartedAt = Date.now();
	state.clients = await loadBootstrapClients();
	const clientsDurationMs = Date.now() - clientsStartedAt;
	await handleSessionStart({
		ctxCwd: cwd,
		startupModeOverride: 'full',
		getFlag: state.getFlag,
		notify: (message: string, level: 'info' | 'warning' | 'error') => {
			if (level === 'error') logger.error(message);
			else if (level === 'warning') logger.warn(message);
			else logger.info(message);
		},
		dbg: (message: string) => logger.debug(message),
		// pi-lens routes only its `Active tools: …` chatter through `log`, and it
		// re-emits it on every workspace switch, so it belongs at debug.
		log: (message: string) => logger.debug(message),
		runtime: state.runtime,
		metricsClient: state.clients.metricsClient,
		cacheManager: state.cacheManager,
		todoScanner: state.clients.todoScanner,
		astGrepClient: state.astGrepClient,
		biomeClient: state.clients.biomeClient,
		ruffClient: state.clients.ruffClient,
		knipClient: state.clients.knipClient,
		jscpdClient: state.clients.jscpdClient,
		deadCodeClients: state.clients.deadCodeClients,
		govulncheckClient: state.clients.govulncheckClient,
		gitleaksClient: state.clients.gitleaksClient,
		trivyClient: state.clients.trivyClient,
		opengrepClient: state.clients.opengrepClient,
		depChecker: state.clients.depChecker,
		testRunnerClient: state.clients.testRunnerClient,
		goClient: state.clients.goClient,
		rustClient: state.clients.rustClient,
		ensureTool,
		cleanStaleTsBuildInfo: () => [],
		resetDispatchBaselines: (cwd?: string) => resetDispatchBaselines(cwd ?? state.projectRoot),
		resetLSPService,
		bootstrapClientsStartedAt: clientsStartedAt,
		bootstrapClientsDurationMs: clientsDurationMs,
	});
	const root = normalizeRoot(cwd);
	if (state.announcedRoots.has(root)) {
		logger.debug(`session re-started for ${cwd}`);
	} else {
		state.announcedRoots.add(root);
		logger.info(`session started for ${cwd}`);
	}
}

export async function stopRuntime(state: LensRuntime): Promise<void> {
	void state;
	try {
		resetLSPService();
	} catch (error) {
		logger.debug(
			`resetLSPService failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	try {
		resetFormatService();
	} catch (error) {
		logger.debug(
			`resetFormatService failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function ensureLspConfig(state: LensRuntime, cwd = state.projectRoot): Promise<void> {
	await initLSPConfig(cwd);
}
