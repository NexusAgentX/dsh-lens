import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { clearWidgetState, recordDiagnostics } from 'pi-lens/dist/clients/widget-state.js';
import { attachCompactSummary, registerLifecycle } from '../hooks.js';

/**
 * The four acceptance criteria for compact injection, driven against the real
 * pi-lens widget-state store rather than a stub:
 *
 *   (a) a clean edit injects nothing at all;
 *   (b) a file with 🔴 blockers gets a bounded (≤200 char) summary appended to
 *       the tool result itself;
 *   (c) the same blocker set is not re-reported on the next edit of that file;
 *   (d) read/bash/grep/glob tool results are never touched.
 */

const ROOT = path.resolve('C:/tmp/dsh-lens-compact-injection');
const FILE = path.join(ROOT, 'src', 'foo.ts');

function fakeState() {
	return {
		flags: {
			enabled: true,
			contextInjection: true,
			compactInjection: true,
			widgetVisible: true,
		},
		projectRoot: ROOT,
		runtime: { projectRoot: ROOT },
		reportedSnapshots: new Map<string, string>(),
		started: Promise.resolve(),
		getFlag: () => undefined,
		cacheManager: {},
		clients: {},
	} as never;
}

function fakeExec(name: string, filePath?: string) {
	return { name, arguments: filePath ? { file_path: filePath } : {} };
}

function result() {
	return { content: [{ type: 'text', text: 'Updated file' }] };
}

/** Capture the handlers `registerLifecycle` installs on a fake context. */
function captureHandlers(state: unknown) {
	const handlers = new Map<string, (...args: any[]) => any>();
	const ctx = {
		on(name: string, handler: (...args: any[]) => any) {
			handlers.set(name, handler);
		},
	};
	registerLifecycle(ctx as never, state as never);
	return handlers;
}

function seedBlockers(entries: Array<{ line?: number; message?: string; semantic?: string }>) {
	recordDiagnostics(
		FILE,
		entries.map((entry) => ({
			semantic: entry.semantic ?? 'blocking',
			severity: 'error',
			line: entry.line,
			message: entry.message,
		})),
	);
}

afterEach(() => {
	clearWidgetState();
});

describe('dsh-lens compact injection acceptance', () => {
	it('(a) leaves a clean edit untouched — zero injection', () => {
		const downstream = { kind: 'accept' };
		const decision = attachCompactSummary(
			fakeState(),
			fakeExec('write', 'src/foo.ts'),
			result(),
			downstream,
			'',
		);
		assert.equal(decision, downstream);
	});

	it('(b) appends a bounded 🔴 summary to the tool result content', () => {
		seedBlockers([
			{ line: 42, message: 'unused import' },
			{ line: 88, message: 'no-explicit-any' },
		]);
		const downstream = { kind: 'accept' };
		const decision = attachCompactSummary(
			fakeState(),
			fakeExec('edit', 'src/foo.ts'),
			result(),
			downstream,
			'',
		);

		assert.notEqual(decision, downstream);
		assert.equal(decision.kind, 'accept');
		// The tool's own rendered content survives; the summary is appended.
		assert.equal(decision.content[0].text, 'Updated file');
		assert.equal(decision.content.length, 2);
		const summary = decision.content[1].text;
		assert.ok(summary.length <= 200, `summary was ${summary.length} chars`);
		assert.ok(summary.includes('🔴'), summary);
		assert.ok(summary.includes('L42'), summary);
		assert.ok(summary.includes('L88'), summary);
	});

	it('(c) does not re-report an unchanged blocker set', () => {
		seedBlockers([{ line: 42, message: 'unused import' }]);
		const state = fakeState();

		const first = attachCompactSummary(
			state,
			fakeExec('edit', 'src/foo.ts'),
			result(),
			{ kind: 'accept' },
			'',
		);
		assert.equal(first.content.length, 2);

		const downstream = { kind: 'accept' };
		const second = attachCompactSummary(
			state,
			fakeExec('edit', 'src/foo.ts'),
			result(),
			downstream,
			'',
		);
		assert.equal(second, downstream);
	});

	it('(c) reports again once the blocker set actually changes', () => {
		seedBlockers([{ line: 42, message: 'unused import' }]);
		const state = fakeState();
		attachCompactSummary(state, fakeExec('edit', 'src/foo.ts'), result(), { kind: 'accept' }, '');

		seedBlockers([
			{ line: 42, message: 'unused import' },
			{ line: 9, message: 'missing await' },
		]);
		const downstream = { kind: 'accept' };
		const decision = attachCompactSummary(
			state,
			fakeExec('edit', 'src/foo.ts'),
			result(),
			downstream,
			'',
		);
		assert.notEqual(decision, downstream);
		assert.ok(decision.content[1].text.includes('L9'), decision.content[1].text);
	});

	it('(d) leaves a read tool result byte-for-byte intact', async () => {
		seedBlockers([{ line: 42, message: 'unused import' }]);
		const state = fakeState();
		const post = captureHandlers(state).get('tools/post-execute');
		assert.ok(post, 'tools/post-execute handler was not registered');

		const downstream = { kind: 'accept' };
		const readResult = { content: [{ type: 'text', text: '<path>src/foo.ts</path>' }] };
		const decision = await post(
			{ name: 'read', arguments: { file_path: 'src/foo.ts' } },
			readResult,
			async () => downstream,
		);
		assert.equal(decision, downstream);
	});

	it('(d) leaves a bash tool result byte-for-byte intact', async () => {
		const state = fakeState();
		const post = captureHandlers(state).get('tools/post-execute');
		assert.ok(post, 'tools/post-execute handler was not registered');
		const downstream = { kind: 'accept' };
		const bashResult = { content: [{ type: 'text', text: 'npm test output' }] };
		const decision = await post(
			{ name: 'bash', arguments: { command: 'npm test' } },
			bashResult,
			async () => downstream,
		);
		assert.equal(decision, downstream);
	});

	it('never attaches content when the decision replaced the result with a value', () => {
		seedBlockers([{ line: 42, message: 'unused import' }]);
		const downstream = { kind: 'accept', value: { spilled: true } };
		const decision = attachCompactSummary(
			fakeState(),
			fakeExec('edit', 'src/foo.ts'),
			result(),
			downstream,
			'',
		);
		assert.equal(decision, downstream);
	});

	it('stays silent on a failed tool call and on a blocked decision', () => {
		seedBlockers([{ line: 42, message: 'unused import' }]);
		const blocked = { kind: 'block' };
		assert.equal(
			attachCompactSummary(fakeState(), fakeExec('edit', 'src/foo.ts'), result(), blocked, ''),
			blocked,
		);

		const downstream = { kind: 'accept' };
		const failed = { ...result(), isError: true };
		assert.equal(
			attachCompactSummary(fakeState(), fakeExec('edit', 'src/foo.ts'), failed, downstream, ''),
			downstream,
		);
	});

	it('still reports an auto-fix that rewrote the file even with no blockers', () => {
		const downstream = { kind: 'accept' };
		const decision = attachCompactSummary(
			fakeState(),
			fakeExec('edit', 'src/foo.ts'),
			result(),
			downstream,
			'✅ Auto-fixed 2 issue(s)\n⚠️ File was modified by auto-format/fix — re-read before further edits.',
		);
		assert.notEqual(decision, downstream);
		assert.ok(decision.content[1].text.includes('auto-fixed 2'), decision.content[1].text);
		assert.ok(decision.content[1].text.includes('re-read'), decision.content[1].text);
	});
});
