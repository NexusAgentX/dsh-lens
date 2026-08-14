import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { registerLensCommands } from './commands.js'
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

export interface Config {
  cwd?: string
  enabled?: boolean
  contextInjection?: boolean
}

export const Config: Schema<Config> = Schema.object({
  cwd: Schema.string(),
  enabled: Schema.boolean(),
  contextInjection: Schema.boolean(),
})

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const state = createRuntime({
    cwd: config.cwd,
    enabled: config.enabled,
    contextInjection: config.contextInjection,
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
