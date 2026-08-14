import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..', '..')

describe('dsh-lens package', () => {
  it('publishes the unscoped name as a dsh bundle', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      name: string
      publishConfig?: { access?: string }
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } }
      dependencies?: { 'pi-lens'?: string }
    }
    assert.equal(pkg.name, 'dsh-lens')
    assert.equal(pkg.publishConfig?.access, 'public')
    assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.ok(pkg.dependencies?.['pi-lens'])
    assert.equal(pkg.dsh?.client?.platform, 'web')
  })

  it('exports a Cordis plugin entry', async () => {
    const mod = await import('../index.js') as { name: string; apply: unknown; Config: unknown }
    assert.equal(mod.name, 'dsh-lens')
    assert.equal(typeof mod.apply, 'function')
    assert.ok(mod.Config)
  })
})
