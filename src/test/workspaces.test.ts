import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWithinRoot, normalizeRoot, rankWorkspaceFiles, rootFromHeader } from '../workspaces.js';

const file = (filePath: string, touchedAt = 0) => ({ filePath, touchedAt });

describe('workspace-root algebra', () => {
	it('normalizes separators, trailing slashes, and drive-letter case', () => {
		assert.equal(normalizeRoot('C:\\Work\\Proj\\'), 'c:/work/proj');
		assert.equal(normalizeRoot('c:/work/proj'), 'c:/work/proj');
		assert.equal(normalizeRoot(undefined), '');
		assert.equal(normalizeRoot(''), '');
	});

	it('matches a file inside the root regardless of separator or case', () => {
		assert.equal(isWithinRoot('C:\\Work\\Proj', 'c:/work/proj/src/a.ts'), true);
		assert.equal(isWithinRoot('c:/work/proj', 'C:\\Work\\Proj\\src\\a.ts'), true);
	});

	it('does not match a sibling whose name only shares a prefix', () => {
		assert.equal(isWithinRoot('/work/proj', '/work/proj-other/a.ts'), false);
		assert.equal(isWithinRoot('/work/proj', '/work/project/a.ts'), false);
	});

	it('treats a missing root as "no scoping"', () => {
		assert.equal(isWithinRoot(undefined, 'anything.ts'), true);
		assert.equal(isWithinRoot('', 'anything.ts'), true);
	});

	it('reads the workspace root from a session header', () => {
		assert.equal(rootFromHeader({ cwd: 'C:/work/proj' }), 'C:/work/proj');
		assert.equal(rootFromHeader({ cwd: '' }), undefined);
		assert.equal(rootFromHeader({ cwd: 42 }), undefined);
		assert.equal(rootFromHeader({}), undefined);
		assert.equal(rootFromHeader(undefined), undefined);
	});

	it('orders newest-first before scoping, so one workspace cannot starve another', () => {
		const files = [
			file('/work/a/stale.ts', 1),
			file('/work/b/busy.ts', 99),
			file('/work/a/fresh.ts', 50),
			file('/work/b/other.ts', 60),
		];
		assert.deepEqual(
			rankWorkspaceFiles(files, '/work/a').map((entry) => entry.filePath),
			['/work/a/fresh.ts', '/work/a/stale.ts'],
		);
		// Everything survives when the session pins no workspace.
		assert.deepEqual(
			rankWorkspaceFiles(files, undefined).map((entry) => entry.filePath),
			['/work/b/busy.ts', '/work/b/other.ts', '/work/a/fresh.ts', '/work/a/stale.ts'],
		);
	});

	it('keeps the extra fields of a scoped entry', () => {
		const rich = [{ filePath: '/work/a/a.ts', touchedAt: 5, diagnosticCounts: { errors: 2 } }];
		const scoped = rankWorkspaceFiles(rich, '/work/a');
		assert.equal(scoped[0]?.diagnosticCounts?.errors, 2);
	});
});
