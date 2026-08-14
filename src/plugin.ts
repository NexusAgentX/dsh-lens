import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { registerLensCommands } from './commands.js'
import { flagOverridesFromConfig, type EngineFlagConfig } from './flags.js'
import { registerLifecycle } from './hooks.js'
import { logger } from './logger.js'
import { registerLensProjection } from './projection.js'
import type {} from './types.js'
import { registerLensPrompt } from './prompt.js'
import { createRuntime, stopRuntime } from './runtime.js'
import { registerLensSkills } from './skills.js'
import { registerLensTools } from './tools.js'

export const name = 'dsh-lens'
export const inject = ['tools']

export interface Config extends EngineFlagConfig {
  cwd?: string
  enabled?: boolean
  contextInjection?: boolean
}

export const Config: Schema<Config> = Schema.object({
  cwd: Schema.string(),
  enabled: Schema.boolean(),
  contextInjection: Schema.boolean(),
  lsp: Schema.boolean(),
  format: Schema.boolean(),
  immediateFormat: Schema.boolean(),
  autofix: Schema.boolean(),
  tests: Schema.boolean(),
  delta: Schema.boolean(),
  guard: Schema.boolean(),
  opengrep: Schema.boolean(),
  readGuard: Schema.boolean(),
  turnSummary: Schema.boolean(),
  actionableWarnings: Schema.boolean(),
  actionableWarningActions: Schema.boolean(),
  actionableWarningAutofix: Schema.boolean(),
  actionableWarningAll: Schema.boolean(),
})

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const state = createRuntime({
    cwd: config.cwd,
    enabled: config.enabled,
    contextInjection: config.contextInjection,
    flagOverrides: flagOverridesFromConfig(config),
  })

  ctx.effect(() => {
    return () => {
      void stopRuntime(state)
    }
  }, 'dsh-lens.runtime')

  registerLensTools(ctx, state)
  registerLensCommands(ctx, state)
  registerLensPrompt(ctx)
  registerLensSkills(ctx)
  registerLensProjection(ctx, state)
  registerLifecycle(ctx, state)

  void state.started.then(() => {
    logger.info('loaded — write/edit feedback is live')
  }).catch((error: unknown) => {
    logger.error('session start failed', error)
  })
}
