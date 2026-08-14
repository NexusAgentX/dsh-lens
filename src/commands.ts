import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { generateLensMap } from 'pi-lens/dist/clients/lens-map.js'
import { computeTDI, loadHistory } from 'pi-lens/dist/clients/metrics-history.js'
import { logger } from './logger.js'
import { renderHealthReport, renderPerfReport, renderToolsReport } from './reports.js'
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
      state.lastMapPath = result.filePath
      const lines = [
        `Project map written to ${result.filePath}`,
        'Open that HTML file in a browser, or use the WebUI lens chip Map link.',
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

  add('lens-health', 'Show runtime health, latency, and LSP status', async () => {
    try {
      return ok(await renderHealthReport(state))
    } catch (error) {
      return fail(error)
    }
  })

  add('lens-perf', 'Show the slowest latency-log phases by p50 and p99', async () => {
    try {
      return ok(await renderPerfReport(state))
    } catch (error) {
      return fail(error)
    }
  })

  add('lens-tools', 'Show language-tool install status', async () => {
    try {
      return ok(await renderToolsReport())
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
