import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';

const LENS_PROMPT = [
	'dsh-lens watches write/edit/bash mutations and injects blockers into the next turn.',
	'Its findings ride on the tool result as a short (≤200 char) summary; a clean edit stays silent, so no summary means no 🔴 blockers — pull the full picture with lens_diagnostics.',
	'Use lens_diagnostics mode=all before declaring work done; mode=full is an expensive project-wide scan.',
	'Discovery funnel: symbol_search → module_report → read_symbol / read_enclosing.',
	'Use ast_grep_search / ast_grep_replace for structural edits; ast_grep_dump when a pattern matches nothing.',
	'Use lsp_navigation for definition/references/rename; keep the official lsp tool for simple go-to when that is enough.',
	'Address 🔴 blockers before continuing. ℹ️ advisories are informational.',
	'Do not start a second copy of the same language server — share the warm LSP this plugin already owns.',
].join(' ');

export function registerLensPrompt(ctx: Context): void {
	ctx.inject(['systemPrompt'], (promptCtx) => {
		promptCtx.systemPrompt.section({
			name: 'dsh-lens',
			order: 118,
			text: LENS_PROMPT,
		});
	});
}
