import { LensPill } from './LensPill.js';
import { NS, en, zh } from './locales.js';

export const name = 'dsh-lens';
export const inject = ['slots', 'locale'];

interface ClientContext {
	effect(fn: () => (() => void) | void, label?: string): void;
	locale: { register(ns: string, dicts: { zh: unknown; en: unknown }): () => void };
	slots: {
		inject(name: string, factory: () => unknown): unknown;
		register(spec: Record<string, unknown>, component: unknown): unknown;
	};
}

export function apply(ctx: ClientContext): void {
	ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-lens: dictionaries');

	// The composer usage row. `mf/stats` (cache hit / usage) registers at order 0
	// and the context meter is rendered by InputBar after the dock, so order 2
	// lands the lens pill between them.
	ctx.slots.inject('conversation.composer.dock', () =>
		ctx.slots.register(
			{
				name: 'conversation.composer.dock',
				id: 'dsh-lens',
				order: 2,
				locale: NS,
			},
			LensPill,
		),
	);
}
