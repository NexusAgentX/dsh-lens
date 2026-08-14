import type { LensStatus } from '../types.js'

export function readLensStatus(useProjection: ((key: string) => unknown) | undefined): LensStatus | undefined {
  if (typeof useProjection !== 'function') return undefined
  const value = useProjection('lens')
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<LensStatus>
  if (typeof record.visible !== 'boolean' || !Array.isArray(record.files)) return undefined
  return record as LensStatus
}

export function chipLabel(status: LensStatus): string {
  if (!status.enabled) return 'lens off'
  if (status.errors > 0 || status.warnings > 0) {
    return `lens ${status.errors}E ${status.warnings}W`.replace(' 0W', '').replace(' 0E', '')
  }
  return status.files.length > 0 ? 'lens clean' : 'lens'
}

export function fileLabel(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
}
