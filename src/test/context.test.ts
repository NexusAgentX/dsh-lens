import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lensNotice, PLUGIN_NAME } from '../context.js';

describe('dsh-lens injected notices', () => {
	it('uses a producer-owned source for format v4 persistence', () => {
		const message = lensNotice('Type error after edit', 'edit diagnostics');
		assert.deepEqual(message.source, {
			kind: PLUGIN_NAME,
			form: 'notice',
			summary: 'edit diagnostics',
		});
		assert.equal(Object.hasOwn(message.source, 'plugin'), false);
		assert.equal(message.role, 'user');
		assert.ok(message.id);
		assert.deepEqual(message.content, [{ type: 'text', text: 'Type error after edit' }]);
	});

	it('retains the default notice summary', () => {
		assert.deepEqual(lensNotice('Turn findings').source, {
			kind: PLUGIN_NAME,
			form: 'notice',
			summary: PLUGIN_NAME,
		});
	});
});
