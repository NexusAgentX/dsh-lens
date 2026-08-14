import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { wrapPiTool } from '../tools.js'

describe('dsh-lens tool wrapper', () => {
  it('projects a pi-lens tool onto the dsh execute/render contract', async () => {
    const wrapped = wrapPiTool({
      name: 'lens_diagnostics',
      label: 'Project Diagnostics',
      description: 'Query diagnostics',
      parameters: {
        type: 'object',
        properties: { mode: { type: 'string' } },
      },
      async execute(_id, params) {
        return {
          content: [{ type: 'text', text: `mode=${String(params.mode ?? 'delta')}` }],
          details: { mode: params.mode ?? 'delta' },
        }
      },
    })

    assert.equal(wrapped.name, 'lens_diagnostics')
    const value = await wrapped.execute({ mode: 'all' }, { signal: new AbortController().signal, token: 't1' })
    assert.deepEqual(value, { text: 'mode=all', details: { mode: 'all' } })
    assert.deepEqual(wrapped.output.render({}, value), [{ type: 'text', text: 'mode=all' }])
    assert.equal(wrapped.presentCall({ file_path: 'src/a.ts' }).card, 'generic')
  })

  it('throws when the upstream tool reports isError', async () => {
    const wrapped = wrapPiTool({
      name: 'ast_grep_search',
      description: 'search',
      async execute() {
        return { content: [{ type: 'text', text: 'bad pattern' }], isError: true }
      },
    })
    await assert.rejects(
      () => wrapped.execute({}, { signal: new AbortController().signal }),
      /bad pattern/,
    )
  })
})
