export interface EngineFlagConfig {
  lsp?: boolean
  format?: boolean
  immediateFormat?: boolean
  autofix?: boolean
  tests?: boolean
  delta?: boolean
  guard?: boolean
  opengrep?: boolean
  readGuard?: boolean
  turnSummary?: boolean
  actionableWarnings?: boolean
  actionableWarningActions?: boolean
  actionableWarningAutofix?: boolean
  actionableWarningAll?: boolean
}

export interface FlagOverrides {
  [name: string]: boolean | string | undefined
}

/**
 * Map plugin config onto pi-lens flag names (`no-lsp`, `immediate-format`, …).
 * Undefined keys are left to `.pi-lens.json` / env.
 */
export function flagOverridesFromConfig(config: EngineFlagConfig): FlagOverrides {
  const overrides: FlagOverrides = {}
  assignInverse(overrides, 'no-lsp', config.lsp)
  assignInverse(overrides, 'no-autoformat', config.format)
  if (config.immediateFormat === true) overrides['immediate-format'] = true
  assignInverse(overrides, 'no-autofix', config.autofix)
  assignInverse(overrides, 'no-tests', config.tests)
  assignInverse(overrides, 'no-delta', config.delta)
  if (config.guard === true) overrides['lens-guard'] = true
  assignInverse(overrides, 'no-opengrep', config.opengrep)
  assignInverse(overrides, 'no-read-guard', config.readGuard)
  if (config.turnSummary === true) overrides['lens-turn-summary'] = true
  if (config.actionableWarnings === true) overrides['lens-actionable-warnings'] = true
  if (config.actionableWarningActions === true) overrides['lens-actionable-warning-actions'] = true
  if (config.actionableWarningAutofix === true) overrides['lens-actionable-warning-autofix'] = true
  if (config.actionableWarningAll === true) overrides['lens-actionable-warning-all'] = true
  return overrides
}

function assignInverse(target: FlagOverrides, flag: string, value: boolean | undefined): void {
  if (value === false) target[flag] = true
  if (value === true) target[flag] = false
}
