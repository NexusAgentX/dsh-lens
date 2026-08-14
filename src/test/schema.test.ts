import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { AstGrepClient } from 'pi-lens/dist/clients/ast-grep-client.js'
import { CacheManager } from 'pi-lens/dist/clients/cache-manager.js'
import { RuntimeCoordinator } from 'pi-lens/dist/clients/runtime-coordinator.js'
import { TOOL_OUTPUT_SCHEMA, toJsonSchema } from '../schema.js'
import { createPiTools, wrapPiTool } from '../tools.js'
import type { LensRuntime } from '../runtime.js'

function fakeRuntime(): LensRuntime {
  const runtime = new RuntimeCoordinator()
  runtime.projectRoot = '/tmp'
  return {
    projectRoot: '/tmp',
    flags: { enabled: true, contextInjection: true, widgetVisible: true },
    runtime,
    cacheManager: new CacheManager(),
    astGrepClient: new AstGrepClient(),
    clients: {},
    getFlag: () => true,
    started: Promise.resolve(),
  }
}

describe('dsh-lens schema subset', () => {
  it('rewrites anyOf to oneOf and drops minItems/maxItems', () => {
    const schema = toJsonSchema({
      type: 'object',
      properties: {
        refresh: {
          anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['cached', 'all'] }],
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
        },
      },
    })
    assert.deepEqual(schema.properties, {
      refresh: {
        oneOf: [
          { type: 'boolean' },
          { type: 'string', enum: ['cached', 'all'] },
        ],
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
      },
    })
    assertSupportedJsonSchema(schema)
  })

  it('drops empty enums and unknown keywords', () => {
    const schema = toJsonSchema({
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: { type: 'string', enum: [] },
          minItems: 1,
        },
      },
    })
    assert.deepEqual(schema.properties, {
      tools: {
        type: 'array',
        items: { type: 'string' },
      },
    })
    assertSupportedJsonSchema(schema)
  })

  it('accepts the wrapPiTool output schema', () => {
    assertSupportedJsonSchema(TOOL_OUTPUT_SCHEMA)
  })

  it('projects every bundled pi-lens tool onto a registerable schema', () => {
    const state = fakeRuntime()
    const tools = createPiTools(state)
    assert.ok(tools.length >= 10)
    for (const tool of tools) {
      const wrapped = wrapPiTool(tool)
      assertSupportedJsonSchema(wrapped.parameters as object)
      assertSupportedJsonSchema(wrapped.output.schema as object)
    }
  })
})
