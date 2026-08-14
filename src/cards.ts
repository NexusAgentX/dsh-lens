import { asRecord, resolveFilePath, stringField } from './events.js'

export type SearchMeta =
  | {
    card: 'search'
    shape: 'matches'
    title: string
    files: Array<{ path: string; matches: Array<{ lineNumber: number; line: string }> }>
    truncated: boolean
    total: number
  }
  | {
    card: 'search'
    shape: 'paths'
    title: string
    paths: string[]
    truncated: boolean
    total: number
  }

export function toolKind(name: string): 'search' | 'read' | 'other' {
  if (name.includes('search') || name.includes('diagnostics') || name === 'symbol_search') return 'search'
  if (name.startsWith('read') || name.includes('report')) return 'read'
  return 'other'
}

export function presentLensCall(name: string, label: string | undefined, args: unknown): {
  card: 'generic'
  title: string
  kind: 'search' | 'read' | 'other'
  locations?: Array<{ path: string; line?: number }>
} {
  const record = asRecord(args)
  const path = resolveFilePath(record)
  const line = typeof record.line === 'number' ? record.line : undefined
  return {
    card: 'generic',
    title: label ?? name,
    kind: toolKind(name),
    ...path ? { locations: [{ path, ...line !== undefined ? { line } : {} }] } : {},
  }
}

export function searchMetaFromValue(name: string, args: unknown, value: unknown): SearchMeta | undefined {
  const kind = toolKind(name)
  if (kind !== 'search') return undefined
  const record = asRecord(value)
  const details = asRecord(record.details)
  const title = name

  const matchLocations = asArray(details.matchLocations ?? details.matches ?? details.locations)
  if (matchLocations.length > 0) {
    const grouped = new Map<string, Array<{ lineNumber: number; line: string }>>()
    for (const item of matchLocations) {
      const entry = asRecord(item)
      const path = resolveFilePath(entry) ?? stringField(entry.file)
      if (!path) continue
      const lineNumber = typeof entry.line === 'number'
        ? entry.line
        : typeof entry.lineNumber === 'number'
          ? entry.lineNumber
          : 1
      const line = stringField(entry.text) ?? stringField(entry.lineText) ?? stringField(entry.message) ?? ''
      const list = grouped.get(path) ?? []
      list.push({ lineNumber, line })
      grouped.set(path, list)
    }
    if (grouped.size > 0) {
      const files = [...grouped.entries()].map(([path, matches]) => ({ path, matches }))
      const total = files.reduce((sum, file) => sum + file.matches.length, 0)
      return { card: 'search', shape: 'matches', title, files, truncated: false, total }
    }
  }

  const paths = asArray(details.files ?? details.paths ?? details.hits)
    .map(item => typeof item === 'string' ? item : resolveFilePath(asRecord(item)))
    .filter((item): item is string => Boolean(item))
  if (paths.length > 0) {
    return { card: 'search', shape: 'paths', title, paths, truncated: false, total: paths.length }
  }

  const argPath = resolveFilePath(asRecord(args))
  if (argPath) {
    return { card: 'search', shape: 'paths', title, paths: [argPath], truncated: false, total: 1 }
  }
  return undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
