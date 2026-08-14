import { useState } from 'react'
import {
  IconChevronDownOutline14,
  Menu,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { chipLabel, openPath, statusDot } from './counts.js'
import css from './LensDock.module.css'
import { translate, type Translate } from './locales.js'
import { buildLensMenuItems, resolveMenuTarget } from './menu-items.js'
import { readLensStatus } from './status-view.js'

interface DockProps {
  useProjection?: (key: string) => unknown
  openFile?: (path: string, line?: number) => void
  t?: Translate
}

export function LensDock({ useProjection, openFile, t = translate }: DockProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  if (!status || !status.visible || !status.enabled) return null
  if (status.files.length === 0 && status.failedLsp.length === 0 && status.lsp.length === 0) return null

  const live = status.lsp.filter(item => item.connected).length
  const meta = [
    ...status.languages.slice(0, 4),
    status.lsp.length > 0 ? t('menu.lsp', { live, total: status.lsp.length }) : '',
    status.failedLsp.length > 0 ? t('menu.failed', { ids: status.failedLsp.join(' ') }) : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className={css.root}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={buildLensMenuItems(status, t)}
        onSelect={(id) => {
          const target = resolveMenuTarget(status, id)
          if (target) openPath(openFile, target.path, target.line)
          setOpen(false)
        }}
        portal
        compact
        align="start"
        side="top"
        anchor={(
          <button
            type="button"
            className={css.trigger}
            aria-expanded={open}
            aria-label={t('menu.aria')}
            onClick={() => setOpen(current => !current)}
          >
            <span className={css.lead}>
              <StateDot state={statusDot(status)} className={css.triggerDot} />
              <span>{chipLabel(status, t)}</span>
            </span>
            <span className={css.meta}>{meta}</span>
            <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
          </button>
        )}
      />
    </div>
  )
}
