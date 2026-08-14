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
    assert.equal(wrapped.presentCall?.({ file_path: 'src/a.ts' })?.card, 'generic')
    const value = await wrapped.execute({ mode: 'all' }, fakeExec())
    assert.deepEqual(value, { text: 'mode=all', details: { mode: 'all' } })
    assert.deepEqual(wrapped.output.render({}, value), [{ type: 'text', text: 'mode=all' }])
  })

  it('forwards session cwd and abort signal as the pi-lens ctx argument', async () => {
    let seen: { cwd?: string; signal?: AbortSignal } | undefined
    const wrapped = wrapPiTool({
      name: 'lens_diagnostics',
      description: 'diag',
      async execute(_id, _params, _signal, _onUpdate, ctx) {
        seen = ctx
        return { content: [{ type: 'text', text: 'ok' }] }
      },
    })
    const signal = new AbortController().signal
    await wrapped.execute({}, {
      signal,
      token: 'call-1',
      agent: { session: { header: { cwd: '/tmp/project' } } },
      deferContext() {},
      concludeTurn() {},
    } as never)
    assert.equal(seen?.cwd, '/tmp/project')
    assert.equal(seen?.signal, signal)
  })

  it('throws when the upstream tool reports isError', async () => {
    const wrapped = wrapPiTool({
      name: 'ast_grep_search',
      description: 'search',
      async execute() {
        return { content: [{ type: 'text', text: 'bad pattern' }], isError: true }
      },
    })
    await assert.rejects(() => wrapped.execute({}, fakeExec()), /bad pattern/)
  })
})

function fakeExec(): any {
  return {
    signal: new AbortController().signal,
    token: Symbol('test'),
    deferContext() {},
    concludeTurn() {},
  }
}
