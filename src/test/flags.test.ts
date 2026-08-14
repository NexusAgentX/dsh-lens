import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { flagOverridesFromConfig } from '../flags.js'

describe('dsh-lens engine flag mapping', () => {
  it('inverts enabled-style switches onto no-* flags', () => {
    const overrides = flagOverridesFromConfig({
      lsp: false,
      format: false,
      autofix: true,
      tests: false,
      guard: true,
      immediateFormat: true,
      turnSummary: true,
    })
    assert.equal(overrides['no-lsp'], true)
    assert.equal(overrides['no-autoformat'], true)
    assert.equal(overrides['no-autofix'], false)
    assert.equal(overrides['no-tests'], true)
    assert.equal(overrides['lens-guard'], true)
    assert.equal(overrides['immediate-format'], true)
    assert.equal(overrides['lens-turn-summary'], true)
  })

  it('leaves unspecified flags unset so project config still wins', () => {
    assert.deepEqual(flagOverridesFromConfig({}), {})
  })
})
