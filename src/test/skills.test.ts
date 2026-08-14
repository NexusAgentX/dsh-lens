import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listBundledSkills, resolvePiLensRoot } from '../skills.js'

describe('dsh-lens bundled skills', () => {
  it('resolves the installed pi-lens package and its skill folders', () => {
    const root = resolvePiLensRoot()
    assert.match(root, /pi-lens$/)
    const skills = listBundledSkills(root)
    const names = skills.map(skill => skill.name).sort()
    assert.deepEqual(names, [
      'pi-lens-ast-grep',
      'pi-lens-lsp-navigation',
      'pi-lens-write-ast-grep-rule',
      'pi-lens-write-tree-sitter-rule',
    ])
    for (const skill of skills) {
      assert.equal(skill.provider, 'dsh-lens')
      assert.ok(skill.description.length > 0)
    }
  })
})
