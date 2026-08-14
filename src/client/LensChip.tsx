import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  IconChevronDownOutline14,
  IconLinkOutline14,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LensStatus } from '../types.js'
import { chipLabel, fileDot, fileKind, fileLabel, openPath, statusDot } from './counts.js'
import css from './LensChip.module.css'
import { readLensStatus } from './status-view.js'

interface ChipProps {
  useProjection?: (key: string) => unknown
  openFile?: (path: string, line?: number) => void
}

export function LensChip({ useProjection, openFile }: ChipProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  if (!status || !status.visible) return null

  const label = chipLabel(status)
  const hot = status.errors > 0 || status.blocking > 0

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`${css.trigger}${hot ? ` ${css.triggerHot}` : ''}`}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(current => !current)}
      >
        <StateDot state={statusDot(status)} className={css.triggerDot} />
        <span className={css.count}>{label}</span>
        <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
      </button>
      {open ? <StatusMenu status={status} openFile={openFile} /> : null}
    </div>
  )
}

function StatusMenu({
  status,
  openFile,
}: {
  status: LensStatus
  openFile?: (path: string, line?: number) => void
}) {
  const lspLive = status.lsp.filter(item => item.connected).length
  return (
    <div className={css.menu} role="dialog" aria-label="dsh-lens diagnostics">
      <div className={css.meta}>
        {status.languages.join(' ') || 'no languages yet'}
        {status.lsp.length > 0 ? ` · LSP ${lspLive}/${status.lsp.length}` : ''}
        {status.failedLsp.length > 0 ? ` · failed ${status.failedLsp.join(' ')}` : ''}
      </div>
      {status.mapPath
        ? (
          <button
            type="button"
            className={css.mapRow}
            onClick={() => openPath(openFile, status.mapPath!)}
          >
            <IconLinkOutline14 />
            Open project map
          </button>
        )
        : null}
      {status.files.length === 0
        ? <div className={css.empty}>No files analyzed this session.</div>
        : status.files.map(file => (
          <button
            key={file.path}
            type="button"
            className={`${css.row}${openFile ? '' : ` ${css.rowIdle}`}`}
            title={file.path}
            onClick={() => openPath(openFile, file.path, file.blockers[0]?.line)}
          >
            <div className={css.fileHead}>
              <StateDot state={fileDot(file)} />
              <span className={css.label}>{fileLabel(file.path)}</span>
              <span className={css.kind}>{fileKind(file)}</span>
            </div>
            {file.blockers.map((blocker, index) => (
              <div key={`${file.path}:${index}`} className={css.blocker}>
                {blocker.line != null ? `L${blocker.line} ` : ''}
                {blocker.rule ? `${blocker.rule} ` : ''}
                {blocker.message}
              </div>
            ))}
          </button>
        ))}
    </div>
  )
}
