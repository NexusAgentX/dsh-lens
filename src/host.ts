import { createMcpHost } from 'pi-lens/dist/clients/mcp/host-shim.js'

export interface LensFlags {
  enabled: boolean
  contextInjection: boolean
}

export function createFlagResolver(
  projectRoot: string,
  sessionFlags: LensFlags,
  overrides: Record<string, boolean | string | undefined> = {},
): (name: string, filePath?: string) => boolean | string | undefined {
  const host = createMcpHost(overrides, projectRoot)
  return (name, filePath) => {
    if (name === 'no-lens' || name === 'lens-disabled') return !sessionFlags.enabled
    if (name === 'no-lens-context') return !sessionFlags.contextInjection
    return host.getFlag(name, filePath)
  }
}
