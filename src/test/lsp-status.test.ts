import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectLspStatus } from 'pi-lens/dist/clients/lsp-status.js';

/**
 * dsh-lens surfaces LSP failures through pi-lens' own selection policy rather
 * than the raw `getFailedLspServerIds()`. These lock the two staleness rules the
 * raw list documents but does not apply, because getting them wrong is how the
 * composer pill reported an `LSP` count for a language server that had spawned
 * successfully and was serving requests.
 *
 * The session-kind vocabulary is pi-lens' own coarse grouping (`jsts`, `python`,
 * `csharp`, …), not server ids or extensions — see `file-kinds.js`.
 */
test('an alive language sibling suppresses a failed server for the same language', () => {
	assert.deepEqual(
		selectLspStatus(['python', 'python-jedi'], ['python'], ['python']).failedIds,
		[],
	);
});

test('a failure with no covering sibling and a language in use still surfaces', () => {
	assert.deepEqual(selectLspStatus([], ['python'], ['python']).failedIds, ['python']);
});

test('a failure for a language no longer in use this session is dropped', () => {
	assert.deepEqual(selectLspStatus([], ['python'], ['jsts']).failedIds, []);
});

test('an auxiliary scanner never surfaces as a language failure', () => {
	assert.deepEqual(selectLspStatus([], ['opengrep'], ['jsts']).failedIds, []);
});

test('an unknown server id is dropped rather than reported', () => {
	assert.deepEqual(selectLspStatus([], ['not-a-server'], ['jsts']).failedIds, []);
});

test('an alive auxiliary does not count as coverage for a language', () => {
	assert.deepEqual(selectLspStatus(['opengrep'], ['python'], ['python']).failedIds, ['python']);
});

test('active ids are the alive set, so the pill can distinguish active from failed', () => {
	const selected = selectLspStatus(['typescript', 'opengrep'], ['python'], ['jsts', 'python']);
	assert.deepEqual(selected.activeIds, ['typescript', 'opengrep']);
	assert.deepEqual(selected.failedIds, ['python']);
});
