import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'

export const PLUGIN_NAME = 'dsh-lens'

export function lensNotice(text: string, summary = 'dsh-lens'): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: PLUGIN_NAME, form: 'notice', summary },
  })
}

export function sessionCwd(
  agent: { session?: { header?: { cwd?: unknown } } } | undefined,
  fallback: string,
): string {
  const cwd = agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : fallback
}
