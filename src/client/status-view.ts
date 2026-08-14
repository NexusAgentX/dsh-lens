import type { LensStatus } from '../types.js'

export function readLensStatus(useProjection: ((key: string) => unknown) | undefined): LensStatus | undefined {
  if (typeof useProjection !== 'function') return undefined
  const value = useProjection('lens')
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<LensStatus>
  if (typeof record.visible !== 'boolean' || !Array.isArray(record.files)) return undefined
  return {
    ...record,
    lsp: Array.isArray(record.lsp) ? record.lsp : [],
    failedLsp: Array.isArray(record.failedLsp) ? record.failedLsp : [],
  } as LensStatus
}

