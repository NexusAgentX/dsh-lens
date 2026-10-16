import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lensPillState } from '../lens-display.js';
import type { LensStatus } from '../lens-status.js';

function status(overrides: Partial<LensStatus> = {}): LensStatus {
	return {
		visible: true,
		enabled: true,
		languages: [],
		blocking: 0,
		errors: 0,
		warnings: 0,
		files: [],
		failedLsp: [],
		lsp: [],
		...overrides,
	};
}

test('pill hides itself when the widget is hidden or the lens is off', () => {
	assert.deepEqual(lensPillState(status({ visible: false })), { kind: 'off' });
	assert.deepEqual(lensPillState(status({ enabled: false })), { kind: 'off' });
});

test('pill stays idle before anything has been analyzed', () => {
	assert.deepEqual(lensPillState(status()), { kind: 'idle' });
});

test('pill shows a check only once files were analyzed and came back clean', () => {
	const file = { path: 'C:/w/a.ts', blocking: 0, errors: 0, warnings: 0, blockers: [] };
	assert.deepEqual(lensPillState(status({ files: [file] })), { kind: 'clean' });
});

test('pill reports the three tiers in pi-lens order, blocking first', () => {
	const state = lensPillState(status({ blocking: 2, errors: 3, warnings: 5 }));
	assert.equal(state.kind, 'counts');
	assert.deepEqual(state.kind === 'counts' ? state.counts.map((c) => c.text) : [], [
		'2B',
		'3E',
		'5W',
	]);
	assert.deepEqual(state.kind === 'counts' ? state.counts.map((c) => c.tier) : [], [
		'blocking',
		'errors',
		'warnings',
	]);
});

test('pill omits zero tiers instead of printing a padded row', () => {
	const state = lensPillState(status({ warnings: 1 }));
	assert.equal(state.kind, 'counts');
	assert.deepEqual(state.kind === 'counts' ? state.counts.map((c) => c.text) : [], ['1W']);
});

test('pill surfaces failed language servers as other issues', () => {
	const state = lensPillState(status({ errors: 1, failedLsp: ['tsserver', 'eslint'] }));
	assert.equal(state.kind, 'counts');
	assert.deepEqual(state.kind === 'counts' ? state.counts.map((c) => c.text) : [], ['1E', '2LSP']);
});

test('a failed language server alone is not clean', () => {
	const file = { path: 'C:/w/a.ts', blocking: 0, errors: 0, warnings: 0, blockers: [] };
	const state = lensPillState(status({ files: [file], failedLsp: ['tsserver'] }));
	assert.equal(state.kind, 'counts');
});
