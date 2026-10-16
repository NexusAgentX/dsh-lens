import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm';

export const PLUGIN_NAME = 'dsh-lens';

// Format v4 requires each context producer to register its own source kind.
declare module '@deepseek-ai/dsh-llm' {
	interface MessageSourceMap {
		'dsh-lens': {
			readonly kind: 'dsh-lens';
			readonly form: 'notice';
			readonly summary: string;
		};
	}
}

export function lensNotice(text: string, summary = 'dsh-lens'): UserMessage {
	return createUserMessage({
		content: [{ type: 'text', text }],
		source: { kind: PLUGIN_NAME, form: 'notice', summary },
	});
}

export function sessionCwd(
	agent: { session?: { header?: { cwd?: unknown } } } | undefined,
	fallback: string,
): string {
	const cwd = agent?.session?.header?.cwd;
	return typeof cwd === 'string' && cwd.length > 0 ? cwd : fallback;
}
