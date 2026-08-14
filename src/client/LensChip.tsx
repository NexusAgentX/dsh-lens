import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { LensStatus } from '../types.js'
import { chipLabel, fileLabel, readLensStatus } from './status-view.js'

interface ChipProps {
  useProjection?: (key: string) => unknown
}

export function LensChip({ useProjection }: ChipProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  if (!status || !status.visible) return null

  const label = chipLabel(status)
  const hot = status.errors > 0 || status.blocking > 0

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
  }

  return (
    <div style={wrap} onKeyDown={onKeyDown}>
      <button
        type="button"
        style={hot ? { ...trigger, color: 'var(--dsw-alias-label-danger, #d4534c)' } : trigger}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(current => !current)}
      >
        {label}
      </button>
      {open ? <StatusMenu status={status} /> : null}
    </div>
  )
}

function StatusMenu({ status }: { status: LensStatus }) {
  return (
    <div style={menu} role="dialog" aria-label="dsh-lens diagnostics">
      <div style={meta}>
        {status.languages.join(' ') || 'no languages yet'}
        {status.failedLsp.length > 0 ? ` · LSP failed: ${status.failedLsp.join(' ')}` : ''}
      </div>
      {status.files.length === 0
        ? <div style={row}>No files analyzed this session.</div>
        : status.files.map(file => (
          <div key={file.path} style={row}>
            <div style={fileTitle}>
              {fileLabel(file.path)}
              <span style={counts}>
                {file.blocking > 0 ? ` ${file.blocking}B` : ''}
                {file.errors > 0 ? ` ${file.errors}E` : ''}
                {file.warnings > 0 ? ` ${file.warnings}W` : ''}
              </span>
            </div>
            {file.blockers.map((blocker, index) => (
              <div key={`${file.path}:${index}`} style={blockerLine}>
                {blocker.line != null ? `L${blocker.line} ` : ''}
                {blocker.rule ? `${blocker.rule} ` : ''}
                {blocker.message}
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

const wrap: CSSProperties = { position: 'relative', display: 'inline-flex' }
const trigger: CSSProperties = {
  minHeight: 28,
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  background: 'transparent',
  border: 0,
  borderRadius: 6,
  alignItems: 'center',
  padding: '3px 6px',
  fontSize: 12,
  lineHeight: '18px',
  display: 'inline-flex',
}
const menu: CSSProperties = {
  zIndex: 100,
  position: 'absolute',
  top: 'calc(100% + 5px)',
  left: 0,
  width: 360,
  maxWidth: 'min(400px, 100vw - 32px)',
  maxHeight: 'min(420px, 100vh - 140px)',
  overflow: 'auto',
  background: 'var(--dsw-specific-menu, #1e1e1e)',
  border: '1px solid var(--dsw-alias-border-l2, #333)',
  borderRadius: 12,
  boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.35))',
  padding: 8,
}
const meta: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 11,
  padding: '4px 8px 8px',
}
const row: CSSProperties = { padding: '6px 8px', fontSize: 13, lineHeight: '18px' }
const fileTitle: CSSProperties = { fontFamily: 'var(--dsw-font-mono, ui-monospace)', marginBottom: 2 }
const counts: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11 }
const blockerLine: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  paddingLeft: 8,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
