import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LensFileStatus, LensStatus } from '../types.js'

export function chipLabel(status: LensStatus): string {
  if (!status.enabled) return 'lens off'
  if (status.errors > 0 || status.warnings > 0) {
    return `lens ${status.errors}E${status.warnings > 0 ? ` ${status.warnings}W` : ''}`
  }
  return status.files.length > 0 ? 'lens clean' : 'lens'
}

export function fileLabel(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
}

export function fileKind(file: LensFileStatus): string {
  const parts = [
    file.blocking > 0 ? `${file.blocking}B` : '',
    file.errors > 0 ? `${file.errors}E` : '',
    file.warnings > 0 ? `${file.warnings}W` : '',
  ].filter(Boolean)
  return parts.join(' ') || 'ok'
}

export function statusDot(status: LensStatus): StateDotState {
  if (!status.enabled) return 'warning'
  if (status.blocking > 0 || status.errors > 0) return 'error'
  if (status.warnings > 0 || status.failedLsp.length > 0) return 'warning'
  return 'done'
}

export function fileDot(file: LensFileStatus): StateDotState {
  if (file.blocking > 0 || file.errors > 0) return 'error'
  if (file.warnings > 0) return 'warning'
  return 'done'
}

export function openPath(
  openFile: ((path: string, line?: number) => void) | undefined,
  path: string,
  line?: number,
): void {
  if (openFile) {
    openFile(path, line)
    return
  }
  if (typeof window !== 'undefined') window.open(path, '_blank', 'noopener')
}
