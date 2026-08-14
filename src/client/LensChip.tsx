import { useState } from 'react'
import {
  IconChevronDownOutline14,
  Menu,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { chipLabel, statusDot } from './counts.js'
import css from './LensChip.module.css'
import { translate, type Translate } from './locales.js'
import { buildLensMenuItems, resolveMenuTarget } from './menu-items.js'
import { openPath } from './counts.js'
import { readLensStatus } from './status-view.js'

interface ChipProps {
  useProjection?: (key: string) => unknown
  openFile?: (path: string, line?: number) => void
  t?: Translate
}

export function LensChip({ useProjection, openFile, t = translate }: ChipProps) {
  const status = readLensStatus(useProjection)
  const [open, setOpen] = useState(false)
  if (!status || !status.visible) return null

  const label = chipLabel(status, t)
  const items = buildLensMenuItems(status, t)

  return (
    <div className={css.root}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        onSelect={(id) => {
          const target = resolveMenuTarget(status, id)
          if (target) openPath(openFile, target.path, target.line)
          setOpen(false)
        }}
        portal
        compact
        align="start"
        side="bottom"
        anchor={(
          <Tooltip label={label} side="bottom" delayMs={400}>
            <button
              type="button"
              className={css.trigger}
              aria-expanded={open}
              aria-label={t('menu.aria')}
              onClick={() => setOpen(current => !current)}
            >
              <StateDot state={statusDot(status)} className={css.triggerDot} />
              <span className={css.count}>{label}</span>
              <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
            </button>
          </Tooltip>
        )}
      />
    </div>
  )
}
