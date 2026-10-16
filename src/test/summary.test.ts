import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	blockerSnapshot,
	buildBlockerLine,
	buildCompactAttachment,
	buildWarnLine,
	capFindings,
	hasFileModifiedNotice,
	MAX_ATTACHMENT_CHARS,
	parseAutofixCount,
	PULL_HINT,
	pipelineErrorFrom,
	toDisplayPath,
} from '../summary.js';

describe('dsh-lens compact summary', () => {
	it('stays silent for a clean edit', () => {
		assert.equal(
			buildCompactAttachment({
				displayPath: 'src/a.ts',
				blockers: [],
				fixedCount: 0,
				fileModified: false,
			}),
			undefined,
		);
	});

	it('reports a blocker set with count, lines and messages', () => {
		const line = buildBlockerLine('src/foo.ts', [
			{ line: 42, message: 'unused import' },
			{ line: 88, message: 'missing return type' },
		]);
		assert.equal(line, '🔴 src/foo.ts — 2 blockers: L42 unused import; L88 missing return type');
	});

	it('uses the singular for one blocker', () => {
		const line = buildBlockerLine('a.ts', [{ line: 1, message: 'boom' }]);
		assert.equal(line, '🔴 a.ts — 1 blocker: L1 boom');
	});

	it('truncates to three entries and reports the remainder', () => {
		const blockers = Array.from({ length: 10 }, (_value, index) => ({
			line: index + 1,
			message: 'x',
		}));
		const line = buildBlockerLine('a.ts', blockers);
		assert.ok(line);
		assert.match(line, /^🔴 a\.ts — 10 blockers: L1 x; L2 x; L3 x; \+7 more$/);
	});

	it('drops entries rather than the header when the budget is tight', () => {
		const blockers = [
			{ line: 1, message: 'a'.repeat(60) },
			{ line: 2, message: 'b'.repeat(60) },
			{ line: 3, message: 'c'.repeat(60) },
		];
		const line = buildBlockerLine('src/foo.ts', blockers, 80);
		assert.ok(line);
		assert.ok(line.length <= 80);
		assert.match(line, /^🔴 src\/foo\.ts — 3 blockers: /);
		assert.match(line, /\+[123] more$/);
	});

	it('keeps the whole attachment within the budget', () => {
		const attachment = buildCompactAttachment({
			displayPath: 'src/foo.ts',
			blockers: [{ line: 42, message: 'unused import' }],
			fixedCount: 3,
			fileModified: true,
		});
		assert.ok(attachment);
		assert.ok(attachment.length <= MAX_ATTACHMENT_CHARS);
		assert.equal(
			attachment,
			[
				'🔴 src/foo.ts — 1 blocker: L42 unused import',
				'⚠️ auto-fixed 3, file modified — re-read',
				PULL_HINT,
			].join('\n'),
		);
	});

	it('emits the warn line alone when there are no blockers', () => {
		const attachment = buildCompactAttachment({
			displayPath: 'src/foo.ts',
			blockers: [],
			fixedCount: 2,
			fileModified: true,
		});
		assert.equal(attachment, ['⚠️ auto-fixed 2, file modified — re-read', PULL_HINT].join('\n'));
	});

	it('does not ask for a re-read when the file was not modified', () => {
		assert.equal(buildWarnLine(2, false), '⚠️ auto-fixed 2');
		assert.equal(buildWarnLine(0, false), undefined);
	});

	it('reports a failed analysis instead of staying silent', () => {
		const attachment = buildCompactAttachment({
			displayPath: 'src/foo.ts',
			blockers: [],
			fixedCount: 0,
			fileModified: false,
			pipelineError: 'pi-lens pipeline crashed while analyzing this write.',
		});
		assert.ok(attachment);
		assert.match(attachment, /^⚠️ pi-lens analysis failed: /);
	});

	it('keys a snapshot on line numbers and message text', () => {
		const first = blockerSnapshot([{ line: 1, message: 'boom' }]);
		assert.equal(first, blockerSnapshot([{ line: 1, message: 'boom' }]));
		// Fixing one blocker while introducing another must not look unchanged.
		assert.notEqual(first, blockerSnapshot([{ line: 2, message: 'boom' }]));
		assert.notEqual(first, blockerSnapshot([{ line: 1, message: 'other' }]));
		assert.equal(blockerSnapshot([]), '');
	});

	it('parses the pi-lens autofix and file-modified prose', () => {
		assert.equal(parseAutofixCount('\n\n✅ Auto-fixed 3 issue(s) (markdownlint:3)'), 3);
		assert.equal(parseAutofixCount('✓ Markdown clean · 1573ms'), 0);
		assert.equal(
			hasFileModifiedNotice('⚠️ **File was modified by auto-format/fix. You MUST re-read'),
			true,
		);
		assert.equal(hasFileModifiedNotice('✓ TypeScript clean · 12ms'), false);
	});

	it('extracts the pipeline crash notice', () => {
		assert.equal(
			pipelineErrorFrom(
				'\n⚠️ pi-lens pipeline crashed while analyzing this write.\nFile: a.ts | crash count: 1',
			),
			'pi-lens pipeline crashed while analyzing this write.',
		);
		assert.equal(pipelineErrorFrom('✓ clean · 1ms'), undefined);
	});

	it('renders workspace-relative display paths with forward slashes', () => {
		assert.equal(toDisplayPath('C:\\p\\src\\a.ts', 'C:/p'), 'src/a.ts');
		assert.equal(toDisplayPath('C:\\other\\a.ts', 'C:/p'), 'C:/other/a.ts');
	});

	it('caps a turn-end finding at its first paragraph', () => {
		assert.equal(capFindings('headline\n\nlong detail'), 'headline');
		assert.equal(capFindings('a'.repeat(300)).length, 200);
	});
});
