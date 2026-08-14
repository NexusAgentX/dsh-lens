import { useState, type CSSProperties } from 'react'
import { chipLabel, fileLabel, readLensStatus } from './status-view.js'

interface DockProps {
  useProjection?: (key: string) => unknown
}

export function LensDock({ useProjection }: DockProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  if (!status || !status.visible || !status.enabled) return null
  if (status.files.length === 0 && status.failedLsp.length === 0) return null

  return (
    <div style={root}>
      <button type="button" style={header} onClick={() => setOpen(current => !current)}>
        <span>{chipLabel(status)}</span>
        <span style={dim}>
          {status.languages.slice(0, 4).join(' ')}
          {status.lsp.length > 0 ? ` · LSP ${status.lsp.filter(item => item.connected).length}/${status.lsp.length}` : ''}
          {status.failedLsp.length > 0 ? ` · down ${status.failedLsp.join(' ')}` : ''}
        </span>
      </button>
      {open
        ? (
          <div style={body}>
            {status.files.map(file => (
              <div key={file.path} style={fileRow}>
                {fileLabel(file.path)}
                {file.blocking > 0 ? ` ${file.blocking}B` : ''}
                {file.errors > 0 ? ` ${file.errors}E` : ''}
                {file.warnings > 0 ? ` ${file.warnings}W` : ''}
              </div>
            ))}
          </div>
        )
        : null}
    </div>
  )
}

const root: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2, #333)',
  borderRadius: 8,
  padding: '2px 8px',
}
const header: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  background: 'transparent',
  border: 0,
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: '22px',
  padding: 0,
}
const dim: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)' }
const body: CSSProperties = { padding: '0 0 6px', fontFamily: 'var(--dsw-font-mono, ui-monospace)', fontSize: 12 }
const fileRow: CSSProperties = { lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }
