import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { getDiagnosticTracker } from 'pi-lens/dist/clients/diagnostic-tracker.js'
import { getLatencyReports } from 'pi-lens/dist/clients/dispatch/integration.js'
import { getAllToolStatuses } from 'pi-lens/dist/clients/installer/index.js'
import { generateLensMap } from 'pi-lens/dist/clients/lens-map.js'
import { getLSPService } from 'pi-lens/dist/clients/lsp/index.js'
import { computeTDI, loadHistory } from 'pi-lens/dist/clients/metrics-history.js'
import { logger } from './logger.js'
import type { LensRuntime } from './runtime.js'

interface CommandResult {
  kind: 'success' | 'error'
  text: string
}

export function registerLensCommands(ctx: Context, state: LensRuntime): void {
  const commands = ctx.get('commands') as {
    register(definition: {
      name: string
      description: string
      input?: { hint: string }
      handler: (invocation: { rawInput: string }) => CommandResult | Promise<CommandResult>
    }): () => void
  } | undefined
  if (!commands) return

  const add = (
    name: string,
    description: string,
    handler: (rawInput: string) => CommandResult | Promise<CommandResult>,
    hint?: string,
  ): void => {
    commands.register({
      name,
      description,
      ...hint ? { input: { hint } } : {},
      handler: async (invocation) => handler(invocation.rawInput),
    })
  }

  add('lens-toggle', 'Toggle dsh-lens on/off for this session', () => {
    state.flags.enabled = !state.flags.enabled
    return ok(state.flags.enabled
      ? 'dsh-lens enabled for this session.'
      : 'dsh-lens disabled for this session. Run /lens-toggle again to resume.')
  })

  add('lens-context-toggle', 'Toggle automatic context injection (tools/LSP/format stay on)', () => {
    state.flags.contextInjection = !state.flags.contextInjection
    return ok(state.flags.contextInjection
      ? 'dsh-lens context injection enabled — findings will be added to the next turn.'
      : 'dsh-lens context injection disabled — findings stay cached (lens_diagnostics, /lens-health).')
  })

  add('lens-widget-toggle', 'Show or hide the WebUI lens diagnostics chip', () => {
    state.flags.widgetVisible = !state.flags.widgetVisible
    return ok(state.flags.widgetVisible
      ? 'dsh-lens widget shown in the WebUI session header / dock.'
      : 'dsh-lens widget hidden. Run /lens-widget-toggle again to show it.')
  })

  add('lens-tdi', 'Show Technical Debt Index and project health trend', async () => {
    try {
      const tdi = computeTDI(loadHistory())
      let summary = 'High debt — run lens_diagnostics mode=full for details'
      if (tdi.score <= 30) summary = 'Codebase is healthy'
      else if (tdi.score <= 60) summary = 'Moderate debt — consider refactoring'
      return ok([
        `TECHNICAL DEBT INDEX: ${tdi.score}/100 (${tdi.grade})`,
        `Files analyzed: ${tdi.filesAnalyzed}`,
        `Files with debt: ${tdi.filesWithDebt}`,
        `Avg MI: ${tdi.avgMI}`,
        `Total cognitive complexity: ${tdi.totalCognitive}`,
        '',
        'Debt breakdown:',
        `  Maintainability: ${tdi.byCategory.maintainability}%`,
        `  Cognitive: ${tdi.byCategory.cognitive}%`,
        `  Nesting: ${tdi.byCategory.nesting}%`,
        `  Max Cyclomatic: ${tdi.byCategory.maxCyclomatic}%`,
        `  Entropy: ${tdi.byCategory.entropy}%`,
        '',
        summary,
      ].join('\n'))
    } catch (error) {
      return fail(error)
    }
  })

  add('lens-map', 'Write an interactive HTML dependency map for the project', async () => {
    try {
      const result = await generateLensMap(state.projectRoot)
      const extras = [
        result.testFileCount > 0 ? `${result.testFileCount} test files excluded` : '',
        result.compiledTwinCount > 0 ? `${result.compiledTwinCount} compiled twins merged` : '',
        result.ignoredFileCount > 0 ? `${result.ignoredFileCount} gitignored files excluded` : '',
      ].filter(Boolean)
      const lines = [
        `Project map written to ${result.filePath}`,
        `${result.fileCount} files, ${result.edgeCount} edges, ${result.externalCount} external deps excluded${extras.length > 0 ? `; ${extras.join(', ')}` : ''}.`,
      ]
      if (result.truncated) {
        lines.push('Graph exceeded the map node cap — showing the highest-degree files only.')
      }
      return ok(lines.join('\n'))
    } catch (error) {
      return fail(error)
    }
  })

  add('lens-health', 'Show runtime health, latency, and LSP status', () => {
    const crashEntries = state.runtime.getCrashEntries().sort((left, right) => right[1] - left[1])
    const totalCrashes = crashEntries.reduce((sum, [, count]) => sum + count, 0)
    const reports = getLatencyReports()
    const last = reports.at(-1)
    const diagStats = getDiagnosticTracker().getStats()
    const lsp = getLSPService()
    const slow = last?.runners
      ? [...last.runners].sort((left, right) => right.durationMs - left.durationMs).slice(0, 3)
      : []
    return ok([
      `dsh-lens ${state.flags.enabled ? 'enabled' : 'disabled'} · context ${state.flags.contextInjection ? 'on' : 'off'}`,
      `project: ${state.projectRoot}`,
      `LSP clients: ${lsp.getAliveClientCount()}`,
      `pipeline crashes: ${totalCrashes}${crashEntries.length > 0 ? ` (${crashEntries.slice(0, 5).map(([name, count]) => `${name}=${count}`).join(', ')})` : ''}`,
      last
        ? `last dispatch: ${last.totalDurationMs ?? '?'}ms · ${last.totalDiagnostics ?? 0} diagnostics · ${last.filePath ?? ''}`
        : 'last dispatch: none yet',
      slow.length > 0 ? `slow runners: ${slow.map(runner => `${runner.name ?? '?'} ${runner.durationMs}ms`).join(', ')}` : '',
      `tracker: ${JSON.stringify(diagStats)}`,
    ].filter(Boolean).join('\n'))
  })

  add('lens-perf', 'Show recent dispatch latency samples', () => {
    const reports = getLatencyReports().slice(-8).reverse()
    if (reports.length === 0) return ok('No latency samples yet. Edit a file first.')
    return ok(reports.map((report, index) => {
      const runners = (report.runners ?? [])
        .slice()
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 3)
        .map(runner => `${runner.name ?? '?'} ${runner.durationMs}ms`)
        .join(', ')
      return `${index + 1}. ${report.totalDurationMs ?? '?'}ms ${report.filePath ?? ''} (${runners || 'no runners'})`
    }).join('\n'))
  })

  add('lens-tools', 'Show language-tool install status', () => {
    try {
      const rows = getAllToolStatuses()
      if (rows.length === 0) return ok('No tool status available yet.')
      return ok(rows.map(row => `${row.name}: ${row.status ?? row.source ?? 'unknown'}${row.path ? ` (${row.path})` : ''}`).join('\n'))
    } catch (error) {
      return fail(error)
    }
  })

  add('lens-allow-edit', 'Override the read-before-edit guard for one path', (rawInput) => {
    const target = rawInput.trim()
    if (!target) return { kind: 'error', text: 'Usage: /lens-allow-edit <path>' }
    const resolved = target.startsWith('/') ? target : `${state.projectRoot.replace(/\/$/, '')}/${target}`
    state.runtime.readGuard.addExemption(resolved)
    return ok(`Read guard override armed for next edit: ${resolved}`)
  }, '<path>')

  logger.debug('registered /lens-* commands')
}

function ok(text: string): CommandResult {
  return { kind: 'success', text }
}

function fail(error: unknown): CommandResult {
  return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
}
