export const NS = 'lens' as const

export type LensKey =
  | 'chip.clean'
  | 'chip.off'
  | 'chip.idle'
  | 'chip.counts'
  | 'menu.aria'
  | 'menu.empty'
  | 'menu.map'
  | 'menu.meta'
  | 'menu.lsp'
  | 'menu.failed'
  | 'file.ok'

export const en: Record<LensKey, string> = {
  'chip.clean': 'lens clean',
  'chip.off': 'lens off',
  'chip.idle': 'lens',
  'chip.counts': 'lens {errors}E {warnings}W',
  'menu.aria': 'dsh-lens diagnostics',
  'menu.empty': 'No files analyzed this session.',
  'menu.map': 'Open project map',
  'menu.meta': '{languages}',
  'menu.lsp': 'LSP {live}/{total}',
  'menu.failed': 'failed {ids}',
  'file.ok': 'ok',
}

export const zh: Record<LensKey, string> = {
  'chip.clean': 'lens 清洁',
  'chip.off': 'lens 已关闭',
  'chip.idle': 'lens',
  'chip.counts': 'lens {errors}E {warnings}W',
  'menu.aria': 'dsh-lens 诊断',
  'menu.empty': '本会话还没有分析过文件。',
  'menu.map': '打开项目地图',
  'menu.meta': '{languages}',
  'menu.lsp': 'LSP {live}/{total}',
  'menu.failed': '失败 {ids}',
  'file.ok': '正常',
}

export type Translate = (key: LensKey, vars?: Record<string, string | number>) => string

export function translate(key: LensKey, vars: Record<string, string | number> = {}): string {
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    en[key],
  )
}
