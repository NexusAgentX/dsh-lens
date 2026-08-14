import {
  exportWidgetState,
  getFailedLspServerIds,
  getSessionLanguages,
} from 'pi-lens/dist/clients/widget-state.js'
import type { LensFlags } from './host.js'
import type { LensBlocker, LensFileStatus, LensStatus } from './types.js'

const MAX_FILES = 8
const MAX_BLOCKERS_PER_FILE = 3

interface WidgetDiagnostic {
  semantic?: string
  severity?: string
  line?: number
  rule?: string
  message?: string
}

interface WidgetFile {
  filePath: string
  touchedAt?: number
  diagnosticCounts?: { blocking?: number; errors?: number; warnings?: number }
  allDiagnostics?: WidgetDiagnostic[]
  diagnostics?: WidgetDiagnostic[]
}

function isBlocking(diagnostic: WidgetDiagnostic): boolean {
  if (diagnostic.semantic === 'blocking') return true
  return diagnostic.semantic == null && diagnostic.severity === 'error'
}

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts.at(-1) || filePath
}

export function emptyLensStatus(flags: Pick<LensFlags, 'enabled' | 'widgetVisible'>): LensStatus {
  return {
    visible: flags.widgetVisible,
    enabled: flags.enabled,
    languages: [],
    blocking: 0,
    errors: 0,
    warnings: 0,
    files: [],
    failedLsp: [],
  }
}

export function snapshotLensStatus(flags: Pick<LensFlags, 'enabled' | 'widgetVisible'>): LensStatus {
  const widget = exportWidgetState() as { files?: WidgetFile[] }
  const ranked = [...widget.files ?? []]
    .sort((left, right) => (right.touchedAt ?? 0) - (left.touchedAt ?? 0))
    .slice(0, MAX_FILES)

  const files: LensFileStatus[] = ranked.map((file) => {
    const diagnostics = file.allDiagnostics ?? file.diagnostics ?? []
    const blockers: LensBlocker[] = diagnostics
      .filter(isBlocking)
      .slice(0, MAX_BLOCKERS_PER_FILE)
      .map(diagnostic => ({
        path: file.filePath,
        ...typeof diagnostic.line === 'number' ? { line: diagnostic.line } : {},
        ...diagnostic.rule ? { rule: diagnostic.rule } : {},
        message: diagnostic.message ?? '',
      }))
    return {
      path: file.filePath,
      blocking: file.diagnosticCounts?.blocking ?? blockers.length,
      errors: file.diagnosticCounts?.errors ?? 0,
      warnings: file.diagnosticCounts?.warnings ?? 0,
      blockers,
    }
  })

  return {
    visible: flags.widgetVisible,
    enabled: flags.enabled,
    languages: getSessionLanguages().slice(0, 6),
    blocking: files.reduce((sum, file) => sum + file.blocking, 0),
    errors: files.reduce((sum, file) => sum + file.errors, 0),
    warnings: files.reduce((sum, file) => sum + file.warnings, 0),
    files,
    failedLsp: getFailedLspServerIds(),
  }
}

export function lensStatusEqual(left: LensStatus | null, right: LensStatus): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function formatLensChip(status: LensStatus): string {
  if (!status.enabled) return 'lens off'
  const parts: string[] = []
  if (status.errors > 0) parts.push(`${status.errors}E`)
  if (status.warnings > 0) parts.push(`${status.warnings}W`)
  if (parts.length === 0) return status.files.length > 0 ? 'lens clean' : 'lens'
  return `lens ${parts.join(' ')}`
}

export function formatLensDock(status: LensStatus): string {
  const header = formatLensChip(status)
  const langs = status.languages.length > 0 ? ` · ${status.languages.join(' ')}` : ''
  const files = status.files.slice(0, 4).map((file) => {
    const counts = [
      file.blocking > 0 ? `${file.blocking}B` : '',
      file.errors > 0 ? `${file.errors}E` : '',
      file.warnings > 0 ? `${file.warnings}W` : '',
    ].filter(Boolean).join(' ')
    return `${basename(file.path)}${counts ? ` ${counts}` : ''}`
  })
  const failed = status.failedLsp.length > 0 ? ` · LSP failed: ${status.failedLsp.join(' ')}` : ''
  return [header + langs + failed, ...files].join('\n')
}
