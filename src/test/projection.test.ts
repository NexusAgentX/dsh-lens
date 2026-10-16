import { Context } from '@deepseek-ai/cordis';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { registerLensProjection } from '../projection.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..');

interface CapturedDefinition {
	key?: string;
	stateSchema?: { parse?: (value: unknown) => unknown };
	schema?: unknown;
	wire?: { viewSchema?: unknown; view?: (value: never) => unknown };
	init?: unknown;
	apply?: unknown;
	stateVersion?: number;
}

function captureDefinition(): CapturedDefinition {
	let captured: CapturedDefinition | undefined;
	const ctx = {
		inject: (_deps: string[], callback: (scope: unknown) => void) => {
			callback({
				sessionProjections: {
					register: (definition: CapturedDefinition) => {
						captured = definition;
						return () => undefined;
					},
				},
			});
		},
	};
	const state = {
		flags: { enabled: true, contextInjection: true, widgetVisible: true },
		lastMapPath: undefined as string | undefined,
	};
	registerLensProjection(ctx as never, state as never);
	assert.ok(captured, 'sessionProjections.register() was never called');
	return captured as CapturedDefinition;
}

const fold = {
	root: 'C:/work/proj',
	status: {
		visible: true,
		enabled: true,
		languages: [],
		blocking: 1,
		errors: 0,
		warnings: 0,
		files: [],
		failedLsp: [],
		lsp: [],
	},
};

describe('lens session projection', () => {
	it('registers a client-visible unit instead of a silent host-only one', () => {
		const definition = captureDefinition();
		assert.equal(definition.key, 'lens');
		// The live runtime reads definition.stateSchema for fold-state validation.
		assert.ok(
			definition.stateSchema,
			'stateSchema is missing: the old `schema` field name makes it undefined',
		);
		assert.equal(definition.schema, undefined, '`schema` is not a live field name');
		// Only units declaring `wire` are ever published to the client, so a missing
		// wire is exactly why useProjection('lens') stayed undefined in the Web UI.
		assert.ok(
			definition.wire,
			'wire is missing: the key would be host-only and never reach the client',
		);
		assert.ok(definition.wire?.viewSchema, 'wire.viewSchema is missing');
		assert.equal(typeof definition.wire?.view, 'function');
		// 3 because the fold gained the host-only `root` field: persisted rows from
		// stateVersion 2 must be discarded rather than forward-applied.
		assert.equal(definition.stateVersion, 3);
	});

	it('publishes the status snapshot and keeps the workspace root host-only', () => {
		const definition = captureDefinition();
		const view = definition.wire?.view;
		assert.equal(typeof view, 'function');
		assert.equal(
			view?.(fold as never),
			fold.status,
			'the wire view must unwrap .status, otherwise the client receives the fold wrapper',
		);
	});

	it('survives the runtime publication step (viewCell) and strips the host-only root', () => {
		const definition = captureDefinition();
		const view = definition.wire?.view;
		const viewSchema = definition.wire?.viewSchema as
			| { parse?: (value: unknown) => unknown }
			| undefined;
		const parse = viewSchema?.parse;
		assert.equal(typeof view, 'function');
		assert.equal(
			typeof parse,
			'function',
			'the runtime calls wire.viewSchema.parse(...) on every publication',
		);
		// Byte-for-byte the publication step in @deepseek-ai/dsh-session-projection
		// lib/index.js viewCell(): wire.viewSchema.parse(wire.view(cell.state)).
		const published = parse?.(view?.(fold as never)) as Record<string, unknown>;
		// readLensStatus() in src/client/status-view.ts rejects anything that is not
		// this shape, which renders the chip and the dock as null.
		assert.equal(typeof published.visible, 'boolean');
		assert.equal(typeof published.enabled, 'boolean');
		assert.ok(Array.isArray(published.files));
		assert.equal(published.blocking, 1);
		assert.equal(published.root, undefined, 'the workspace root must not cross the wire');
		// The wire schema describes the client view, not the fold: handing the fold
		// itself to the publication step must fail loudly instead of shipping it.
		assert.throws(
			() => parse?.(fold),
			'the wire view must unwrap the fold; publishing the wrapper would be rejected',
		);
	});

	it('is published to the client by the real projection registry', () => {
		// The strongest seam available without booting pi-lens: hand the captured
		// definition to the ACTUAL registry from @deepseek-ai/dsh-session-projection
		// and ask it for the client values block. `restore` runs the same recipe the
		// live service runs (init -> fold -> wire.viewSchema.parse(wire.view(state))),
		// so dropping `wire` empties this object and the pill silently disappears.
		const registry = new SessionProjectionRegistry(new Context());
		registry.register(captureDefinition() as never);

		const header = {
			version: 4,
			id: 'probe-session',
			createdAt: 0,
			cwd: 'C:/work/proj',
			isSeeded: false,
		};
		const { snapshot, checkpoint } = registry.restore(
			{},
			[],
			0 as never,
			header as never,
			0 as never,
		);

		assert.deepEqual(
			Object.keys(snapshot.values),
			['lens'],
			'a definition without `wire` publishes nothing, which is why useProjection("lens") was undefined',
		);
		assert.ok(Object.hasOwn(checkpoint, 'lens'), 'the fold must still be persisted host-side');

		const published = snapshot.values.lens as unknown as Record<string, unknown>;
		// Exactly the field set readLensStatus() demands before it will render.
		assert.equal(typeof published.visible, 'boolean');
		assert.equal(typeof published.enabled, 'boolean');
		assert.ok(Array.isArray(published.files));
		assert.equal(typeof published.blocking, 'number');
		assert.ok(Array.isArray(published.failedLsp));
		assert.ok(Array.isArray(published.lsp));
		assert.equal(published.root, undefined, 'the host-only root must not cross the wire');
	});

	it('validates a persisted fold that carries the workspace root', () => {
		const definition = captureDefinition();
		const parsed = definition.stateSchema?.parse?.(fold) as
			| { root?: string; status?: unknown }
			| undefined;
		assert.ok(parsed, 'the fold must survive its own state schema');
		assert.equal(
			parsed.root,
			'C:/work/proj',
			'a state schema without `root` would strip workspace scoping on restore',
		);
		assert.deepEqual(parsed.status, fold.status);
	});

	it('scopes the fold to the session workspace', () => {
		// Neither wiring point can be exercised without booting the pi-lens engine,
		// so guard the two lines that make per-workspace display work.
		const projection = readFileSync(join(pkgRoot, 'src/projection.ts'), 'utf8');
		assert.match(
			projection,
			/rootFromHeader\(header\)/,
			'init() must scope from the session header cwd',
		);
		assert.match(
			projection,
			/root:\s*current\.root/,
			'apply() must re-scope to the workspace stored in the fold, else every conversation lists every workspace',
		);
	});

	it('binds the session bootstrap hook to a real agent lifecycle event', () => {
		const hooks = readFileSync(join(pkgRoot, 'src/hooks.ts'), 'utf8');
		assert.match(hooks, /ctx\.on\(\s*(['"])agent\/created\1/);
		assert.doesNotMatch(
			hooks,
			/ctx\.on\(\s*["']agent\/session-start/,
			'agent/session-start is not in the Events surface, so the hook never fires',
		);
	});
});
