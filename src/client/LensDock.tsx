import { useState } from 'react'
import { IconChevronDownOutline14, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { chipLabel, fileDot, fileKind, fileLabel, openPath, statusDot } from './counts.js'
import css from './LensDock.module.css'
import { readLensStatus } from './status-view.js'

interface DockProps {
  useProjection?: (key: string) => unknown
  openFile?: (path: string, line?: number) => void
}

export function LensDock({ useProjection, openFile }: DockProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  if (!status || !status.visible || !status.enabled) return null
  if (status.files.length === 0 && status.failedLsp.length === 0 && status.lsp.length === 0) return null

  const lspLive = status.lsp.filter(item => item.connected).length
  const meta = [
    ...status.languages.slice(0, 4),
    status.lsp.length > 0 ? `LSP ${lspLive}/${status.lsp.length}` : '',
    status.failedLsp.length > 0 ? `down ${status.failedLsp.join(' ')}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className={css.root}>
      <button type="button" className={css.trigger} onClick={() => setOpen(current => !current)}>
        <span className={css.lead}>
          <StateDot state={statusDot(status)} className={css.triggerDot} />
          <span className={css.count}>{chipLabel(status)}</span>
        </span>
        <span className={css.meta}>{meta}</span>
        <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {status.files.map(file => (
              <button
                key={file.path}
                type="button"
                className={css.row}
                title={file.path}
                onClick={() => openPath(openFile, file.path, file.blockers[0]?.line)}
              >
                <StateDot state={fileDot(file)} />
                <span className={css.label}>{fileLabel(file.path)}</span>
                <span className={css.kind}>{fileKind(file)}</span>
              </button>
            ))}
          </div>
        )
        : null}
    </div>
  )
}
