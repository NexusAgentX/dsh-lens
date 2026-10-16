import { createMcpHost } from 'pi-lens/dist/clients/mcp/host-shim.js';

export interface LensFlags {
	enabled: boolean;
	contextInjection: boolean;
	/**
	 * Compact injection mode: diagnostics ride on the tool result as a bounded
	 * summary instead of a separate, unbounded user message. Orthogonal to
	 * `contextInjection` — turning that off silences the wrapper entirely,
	 * turning this off restores the legacy verbose behaviour.
	 */
	compactInjection: boolean;
	widgetVisible: boolean;
}

export function createFlagResolver(
	projectRoot: string,
	sessionFlags: LensFlags,
	overrides: Record<string, boolean | string | undefined> = {},
): (name: string, filePath?: string) => boolean | string | undefined {
	const host = createMcpHost(overrides, projectRoot);
	return (name, filePath) => {
		if (name === 'no-lens' || name === 'lens-disabled') return !sessionFlags.enabled;
		if (name === 'no-lens-context') return !sessionFlags.contextInjection;
		return host.getFlag(name, filePath);
	};
}
