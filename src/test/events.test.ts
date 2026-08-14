import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractResultText,
  joinFindingMessages,
  normalizeToolEvent,
  normalizeToolInput,
  resolveFilePath,
} from '../events.js'
import { toJsonSchema } from '../schema.js'

describe('dsh-lens event normalization', () => {
  it('maps write file_path/content onto path', () => {
    const input = normalizeToolInput('write', { file_path: 'src/a.ts', content: 'export {}' })
    assert.equal(input.path, 'src/a.ts')
    assert.equal(input.content, 'export {}')
  })

  it('maps edit old_string/new_string onto edits[]', () => {
    const input = normalizeToolInput('edit', {
      file_path: '/tmp/a.ts',
      old_string: 'foo',
      new_string: 'bar',
    })
    assert.equal(input.path, '/tmp/a.ts')
    assert.deepEqual(input.edits, [{ oldText: 'foo', newText: 'bar' }])
  })

  it('keeps an already-normalized edits array', () => {
    const edits = [{ oldText: 'a', newText: 'b' }]
    const input = normalizeToolInput('edit', { path: 'x.ts', edits })
    assert.equal(input.path, 'x.ts')
    assert.equal(input.edits, edits)
  })

  it('maps read file_path and bash command', () => {
    assert.equal(normalizeToolInput('read', { file_path: 'README.md' }).path, 'README.md')
    assert.equal(normalizeToolInput('bash', { command: 'echo hi' }).command, 'echo hi')
  })

  it('builds a host-neutral tool event', () => {
    const event = normalizeToolEvent('write', { file_path: 'a.ts', content: 'x' })
    assert.equal(event.toolName, 'write')
    assert.equal(event.input.path, 'a.ts')
  })

  it('resolves mixed path keys', () => {
    assert.equal(resolveFilePath({ file_path: 'a' }), 'a')
    assert.equal(resolveFilePath({ filePath: 'b' }), 'b')
    assert.equal(resolveFilePath({ path: 'c' }), 'c')
  })

  it('extracts text from wrapped tool values', () => {
    assert.equal(extractResultText({ text: 'ok' }), 'ok')
    assert.equal(extractResultText('plain'), 'plain')
  })

  it('joins finding messages', () => {
    assert.equal(joinFindingMessages(undefined), undefined)
    assert.equal(joinFindingMessages({ messages: [{ content: 'a' }, { content: 'b' }] }), 'a\n\nb')
  })

  it('strips TypeBox-like schemas down to JSON Schema', () => {
    const schema = toJsonSchema({
      type: 'object',
      properties: { mode: { type: 'string' } },
    })
    assert.equal(schema.type, 'object')
    assert.ok(schema.properties)
  })
})
