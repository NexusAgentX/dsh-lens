import { LensChip } from './LensChip.js'
import { LensDock } from './LensDock.js'
import { NS, en, zh } from './locales.js'

export const name = 'dsh-lens'
export const inject = ['slots', 'locale']

interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  locale: { register(ns: string, dicts: { zh: unknown; en: unknown }): () => void }
  slots: {
    inject(name: string, factory: () => unknown): unknown
    register(spec: Record<string, unknown>, component: unknown): unknown
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-lens: dictionaries')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'dsh-lens',
    order: 25,
    locale: NS,
  }, LensChip))

  try {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'dsh-lens',
      order: 5,
      locale: NS,
    }, LensDock))
  } catch {
    // Older web shells may not declare the dock list.
  }
}
