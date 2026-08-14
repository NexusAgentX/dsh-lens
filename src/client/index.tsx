import { LensChip } from './LensChip.js'
import { LensDock } from './LensDock.js'

export const name = 'dsh-lens'
export const inject = ['slots']

interface ClientSlots {
  inject(name: string, factory: () => unknown): unknown
  register(spec: Record<string, unknown>, component: unknown): unknown
}

interface ClientContext {
  slots: ClientSlots
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'dsh-lens',
    order: 25,
  }, LensChip))

  try {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'dsh-lens',
      order: 5,
    }, LensDock))
  } catch {
    // Older web shells may not declare the dock list.
  }
}
