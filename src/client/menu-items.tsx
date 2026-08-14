import type { ReactNode } from 'react'
import { IconLinkOutline14, StateDot, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LensStatus } from '../types.js'
import { fileDot, fileKind, fileLabel } from './counts.js'
import type { Translate } from './locales.js'
import chipCss from './LensChip.module.css'

export function fileRowLabel(path: string, kind: string): ReactNode {
  return (
    <span className={chipCss.fileLabel}>
      <span className={chipCss.name}>{fileLabel(path)}</span>
      <span className={chipCss.kind}>{kind}</span>
    </span>
  )
}

export function buildLensMenuItems(status: LensStatus, t: Translate): MenuEntry[] {
  const items: MenuEntry[] = []
  const live = status.lsp.filter(item => item.connected).length
  const meta = [
    status.languages.join(' ') || t('chip.idle'),
    status.lsp.length > 0 ? t('menu.lsp', { live, total: status.lsp.length }) : '',
    status.failedLsp.length > 0 ? t('menu.failed', { ids: status.failedLsp.join(' ') }) : '',
  ].filter(Boolean).join(' · ')
  items.push({ type: 'label', id: 'meta', text: meta })

  if (status.mapPath) {
    items.push({
      id: 'map',
      label: t('menu.map'),
      icon: <IconLinkOutline14 />,
    })
  }

  if (status.files.length === 0) {
    items.push({ type: 'label', id: 'empty', text: t('menu.empty') })
    return items
  }

  items.push({ type: 'separator', id: 'files' })
  for (const file of status.files) {
    const kind = fileKind(file) || t('file.ok')
    const blockers = file.blockers.slice(0, 5).map((blocker, index) => ({
      id: `blocker:${file.path}:${index}`,
      label: `${blocker.line != null ? `L${blocker.line} ` : ''}${blocker.rule ? `${blocker.rule} ` : ''}${blocker.message}`,
    }))
    items.push({
      id: `file:${file.path}`,
      label: fileRowLabel(file.path, kind),
      icon: <StateDot state={fileDot(file)} />,
      ...blockers.length > 0 ? { submenu: blockers } : {},
    })
  }
  return items
}

export function resolveMenuTarget(status: LensStatus, id: string): { path: string; line?: number } | undefined {
  if (id === 'map' && status.mapPath) return { path: status.mapPath }
  if (id.startsWith('file:')) return { path: id.slice('file:'.length) }
  if (id.startsWith('blocker:')) {
    const rest = id.slice('blocker:'.length)
    const index = rest.lastIndexOf(':')
    const path = rest.slice(0, index)
    const slot = Number(rest.slice(index + 1))
    const file = status.files.find(item => item.path === path)
    const blocker = file?.blockers[slot]
    return { path, ...typeof blocker?.line === 'number' ? { line: blocker.line } : {} }
  }
  return undefined
}
