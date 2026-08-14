import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { LensRuntime } from './runtime.js'
import { emptyLensStatus, lensStatusEqual, snapshotLensStatus } from './status.js'
import type { LensStatus } from './types.js'

const blockerSchema = z.object({
  path: z.string(),
  line: z.number().optional(),
  rule: z.string().optional(),
  message: z.string(),
})

const fileSchema = z.object({
  path: z.string(),
  blocking: z.number(),
  errors: z.number(),
  warnings: z.number(),
  blockers: z.array(blockerSchema),
})

const lensSchema = z.object({
  visible: z.boolean(),
  enabled: z.boolean(),
  languages: z.array(z.string()),
  blocking: z.number(),
  errors: z.number(),
  warnings: z.number(),
  files: z.array(fileSchema),
  failedLsp: z.array(z.string()),
})

const REFRESH_EVENTS = new Set([
  'tool/result',
  'turn/end',
  'turn/start',
  'command/done',
  'command/run',
])

export function registerLensProjection(ctx: Context, state: LensRuntime): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'lens', LensStatus>({
      key: 'lens',
      schema: lensSchema,
      init: () => emptyLensStatus(state.flags),
      apply: (current, event) => {
        if (!REFRESH_EVENTS.has(event.type)) return current
        const next = snapshotLensStatus(state.flags)
        return lensStatusEqual(current, next) ? current : next
      },
      view: value => value,
      stateVersion: 1,
    })
  })
}
