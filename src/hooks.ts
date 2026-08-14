import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { getFormatService, resetFormatService } from 'pi-lens/dist/clients/format-service.js'
import { resetLSPService } from 'pi-lens/dist/clients/lsp/index.js'
import { handleAgentEnd } from 'pi-lens/dist/clients/runtime-agent-end.js'
import {
  consumeSessionStartGuidance,
  consumeTestFindings,
  consumeTurnEndFindings,
} from 'pi-lens/dist/clients/runtime-context.js'
import { handleToolCall } from 'pi-lens/dist/clients/runtime-tool-call.js'
import { handleToolResult } from 'pi-lens/dist/clients/runtime-tool-result.js'
import { handleTurnEnd } from 'pi-lens/dist/clients/runtime-turn.js'
import { lensNotice, sessionCwd } from './context.js'
import { extractResultText, joinFindingMessages, normalizeToolEvent, OBSERVED_TOOLS } from './events.js'
import { logger } from './logger.js'
import { ensureLspConfig, type LensRuntime } from './runtime.js'

interface AgentLike {
  inject?(message: unknown): void
  session?: { id?: string; header?: { cwd?: string } }
}

export function registerLifecycle(ctx: Context, state: LensRuntime): void {
  ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<any>) => {
    if (!state.flags.enabled || !OBSERVED_TOOLS.has(exec.name)) return next()
    await state.started
    const cwd = sessionCwd(exec.agent, state.projectRoot)
    state.sessionCwd = cwd
    const event = normalizeToolEvent(exec.name, exec.arguments)
    try {
      const decision = await handleToolCall({
        event,
        ctx: { cwd },
        lensEnabled: state.flags.enabled,
        getFlag: state.getFlag,
        dbg: (message: string) => logger.debug(message),
        runtime: state.runtime,
        cacheManager: state.cacheManager,
        ensureLSPConfigInitialized: (root: string) => ensureLspConfig(state, root),
        updateLspStatus: () => undefined,
        resetLSPService,
      })
      if (decision && decision.block) {
        return { kind: 'deny', reason: decision.reason ?? 'blocked by dsh-lens' }
      }
    } catch (error) {
      logger.warn(`tool_call hook failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return next()
  })

  ctx.on('tools/post-execute', async (exec: any, result: any, next: () => Promise<any>) => {
    const downstream = await next()
    if (!state.flags.enabled || !OBSERVED_TOOLS.has(exec.name)) return downstream
    await state.started
    const event = normalizeToolEvent(exec.name, exec.arguments)
    let extra: string | undefined
    try {
      const updated = await handleToolResult({
        event: {
          ...event,
          isError: Boolean(result?.isError),
          content: [{ type: 'text', text: extractResultText(result?.value ?? result) }],
          sessionId: exec.agent?.session?.id,
        },
        getFlag: state.getFlag,
        dbg: (message: string) => logger.debug(message),
        runtime: state.runtime,
        cacheManager: state.cacheManager,
        biomeClient: state.clients.biomeClient,
        ruffClient: state.clients.ruffClient,
        metricsClient: state.clients.metricsClient,
        resetLSPService,
        readGuard: state.runtime.readGuard,
        agentBehaviorRecord: (toolName: string, filePath?: string) => {
          const client = state.clients.agentBehaviorClient as { recordToolCall?: (name: string, path?: string) => unknown[] } | undefined
          return client?.recordToolCall?.(toolName, filePath) ?? []
        },
        formatBehaviorWarnings: (warnings: unknown[]) => {
          const client = state.clients.agentBehaviorClient as { formatWarnings?: (items: unknown[]) => string } | undefined
          return client?.formatWarnings?.(warnings) ?? ''
        },
        sessionId: exec.agent?.session?.id,
      })
      extra = (updated?.content ?? []).map(block => block.text ?? '').filter(Boolean).join('\n')
    } catch (error) {
      logger.warn(`tool_result hook failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!extra || !state.flags.contextInjection) return downstream
    const notice = lensNotice(extra, `${exec.name} diagnostics`)
    if (downstream.kind === 'block') {
      return {
        ...downstream,
        additionalContexts: [notice, ...downstream.additionalContexts ?? []],
      }
    }
    return {
      ...downstream,
      additionalContexts: [notice, ...downstream.additionalContexts ?? []],
    }
  })

  ctx.on('agent/session-start', async (payload: { agent: AgentLike }) => {
    await state.started
    if (!state.flags.enabled || !state.flags.contextInjection) return
    const guidance = joinFindingMessages(
      consumeSessionStartGuidance(
        state.cacheManager,
        sessionCwd(payload.agent, state.projectRoot),
      ),
    )
    if (guidance) inject(payload.agent, guidance, 'session start')
  })

  ctx.on('agent/turn-stopping', async (payload: { agent: AgentLike }) => {
    if (!state.flags.enabled) return
    await state.started
    const cwd = sessionCwd(payload.agent, state.projectRoot)
    try {
      await handleTurnEnd({
        ctxCwd: cwd,
        getFlag: state.getFlag,
        dbg: (message: string) => logger.debug(message),
        runtime: state.runtime,
        cacheManager: state.cacheManager,
        knipClient: state.clients.knipClient,
        deadCodeClients: state.clients.deadCodeClients,
        depChecker: state.clients.depChecker,
        testRunnerClient: state.clients.testRunnerClient,
        resetLSPService,
        resetFormatService,
      })
    } catch (error) {
      logger.warn(`turn_end hook failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (!state.flags.contextInjection) return
    const findings = [
      joinFindingMessages(consumeTurnEndFindings(state.cacheManager, cwd)),
      joinFindingMessages(consumeTestFindings(state.cacheManager, cwd)),
    ].filter((text): text is string => Boolean(text))
    if (state.getFlag('lens-turn-summary') === true) {
      const { formatLensDock, snapshotLensStatus } = await import('./status.js')
      findings.push(formatLensDock(snapshotLensStatus(state.flags, { mapPath: state.lastMapPath })))
    }
    for (const text of findings) inject(payload.agent, text, 'turn findings')
  })

  ctx.on('agent/status', async (payload: { agent: AgentLike; status: string }) => {
    if (payload.status !== 'idle' || !state.flags.enabled) return
    await state.started
    try {
      await handleAgentEnd({
        ctxCwd: sessionCwd(payload.agent, state.projectRoot),
        getFlag: state.getFlag,
        notify: (message: string) => logger.info(message),
        dbg: (message: string) => logger.debug(message),
        runtime: state.runtime,
        cacheManager: state.cacheManager,
        getFormatService,
        currentSessionId: payload.agent.session?.id,
      })
    } catch (error) {
      logger.debug(`agent_end hook failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function inject(agent: AgentLike, text: string, summary: string): void {
  try {
    agent.inject?.(lensNotice(text, summary))
  } catch (error) {
    logger.debug(`inject failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
