import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { presentLensCall, searchMetaFromValue } from '../cards.js'
import { formatLensChip, lensStatusEqual } from '../status.js'
import type { LensStatus } from '../types.js'

describe('dsh-lens web cards', () => {
  it('marks diagnostics and search tools as search calls with file follow-along', () => {
    const view = presentLensCall('ast_grep_search', 'AST Search', { file_path: 'src/a.ts', line: 12 })
    assert.equal(view.card, 'generic')
    assert.equal(view.kind, 'search')
    assert.deepEqual(view.locations, [{ path: 'src/a.ts', line: 12 }])
  })

  it('groups matchLocations into a search card', () => {
    const meta = searchMetaFromValue('lens_diagnostics', {}, {
      details: {
        matchLocations: [
          { path: 'a.ts', line: 3, message: 'missing return' },
          { file_path: 'a.ts', line: 8, text: 'unused' },
          { path: 'b.ts', line: 1, message: 'boom' },
        ],
      },
    })
    assert.ok(meta)
    assert.equal(meta.shape, 'matches')
    assert.equal(meta.total, 3)
    assert.equal(meta.files?.length, 2)
  })

  it('falls back to a path list from details.files', () => {
    const meta = searchMetaFromValue('symbol_search', {}, {
      details: { files: [{ path: 'src/main.ts' }, 'src/lib.ts'] },
    })
    assert.equal(meta?.shape, 'paths')
    if (meta?.shape === 'paths') assert.deepEqual(meta.paths, ['src/main.ts', 'src/lib.ts'])
  })
})

describe('dsh-lens status formatting', () => {
  const clean: LensStatus = {
    visible: true,
    enabled: true,
    languages: ['ts'],
    blocking: 0,
    errors: 0,
    warnings: 0,
    files: [{ path: 'a.ts', blocking: 0, errors: 0, warnings: 0, blockers: [] }],
    failedLsp: [],
  }

  it('labels a clean session and compares by value', () => {
    assert.equal(formatLensChip(clean), 'lens clean')
    assert.equal(lensStatusEqual(clean, { ...clean }), true)
    assert.equal(lensStatusEqual(clean, { ...clean, errors: 1 }), false)
  })
})
