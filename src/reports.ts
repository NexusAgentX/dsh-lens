import { basename } from 'node:path'
import { getCascadeSessionStats, getDispatchSlopScoreLine, getLatencyReports } from 'pi-lens/dist/clients/dispatch/integration.js'
import { getDiagnosticTracker } from 'pi-lens/dist/clients/diagnostic-tracker.js'
import { getEventLoopStats } from 'pi-lens/dist/clients/event-loop-monitor.js'
import { getAllToolStatuses } from 'pi-lens/dist/clients/installer/index.js'
import { getLSPService } from 'pi-lens/dist/clients/lsp/index.js'
import {
  collectLatencyPerformance,
  renderLatencyPerformanceReport,
} from 'pi-lens/dist/clients/performance-report.js'
import type { LensRuntime } from './runtime.js'

export async function renderHealthReport(state: LensRuntime): Promise<string> {
  const crashEntries = state.runtime.getCrashEntries().sort((left, right) => right[1] - left[1])
  const totalCrashes = crashEntries.reduce((sum, [, count]) => sum + count, 0)
  const reports = getLatencyReports()
  const last = reports.at(-1)
  const diagStats = getDiagnosticTracker().getStats() as {
    totalShown?: number
    totalAutoFixed?: number
    totalAgentFixed?: number
    totalUnresolved?: number
    repeatOffenders?: Array<{ filePath: string; line?: number; ruleId?: string; count: number }>
    topViolations?: Array<{ ruleId: string; count: number; samplePaths?: string[] }>
  }
  const sessionAge = Date.now() - state.runtime.sessionStartedAt
  const sessionMins = Math.floor(sessionAge / 60_000)
  const sessionHrs = Math.floor(sessionMins / 60)
  const sessionAgeStr = sessionHrs > 0 ? `${sessionHrs}h ${sessionMins % 60}m` : `${sessionMins}m`
  const startedAt = new Date(state.runtime.sessionStartedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const lines = [
    'PI-LENS HEALTH',
    `Session started: ${startedAt} (${sessionAgeStr} ago)`,
    `dsh-lens ${state.flags.enabled ? 'enabled' : 'disabled'} · context ${state.flags.contextInjection ? 'on' : 'off'} · widget ${state.flags.widgetVisible ? 'on' : 'off'}`,
    `project: ${state.projectRoot}`,
    '',
    `Pipeline crashes (session): ${totalCrashes}`,
    `Files affected: ${crashEntries.length}`,
  ]
  if (crashEntries.length > 0) {
    lines.push('', 'Top crash files:')
    for (const [file, count] of crashEntries.slice(0, 5)) {
      lines.push(`  ${basename(file)}: ${count}`)
    }
  }
  if (last) {
    const slow = [...last.runners ?? []].sort((left, right) => right.durationMs - left.durationMs).slice(0, 3)
    lines.push('', `Last dispatch: ${basename(last.filePath ?? '')} (${last.totalDurationMs}ms, ${last.totalDiagnostics} diagnostics)`)
    if (slow.length > 0) {
      lines.push('Top runners (last dispatch):')
      for (const runner of slow) {
        lines.push(`  ${runner.name ?? runner.runnerId ?? '?'}: ${runner.durationMs}ms${runner.status ? ` (${runner.status})` : ''}`)
      }
    }
  } else {
    lines.push('', 'No dispatch latency reports yet.')
  }
  lines.push(
    '',
    `Diagnostics shown: ${diagStats.totalShown ?? 0}`,
    `Auto-fixed: ${diagStats.totalAutoFixed ?? 0}`,
    `Agent-fixed: ${diagStats.totalAgentFixed ?? 0}`,
    `Unresolved carryover: ${diagStats.totalUnresolved ?? 0}`,
  )
  const loop = getEventLoopStats() as { maxMs?: number; p99Ms?: number; meanMs?: number } | undefined
  if (loop) {
    lines.push('', `Event loop (session): worst block ${loop.maxMs}ms · p99 ${loop.p99Ms}ms · mean ${loop.meanMs}ms`)
    if ((loop.maxMs ?? 0) > 100) {
      lines.push('  warning: a >100ms synchronous block can stutter the UI — check latency.log')
    }
  }
  for (const offender of diagStats.repeatOffenders?.slice(0, 5) ?? []) {
    if (lines.at(-1) !== 'Repeat offenders:') lines.push('', 'Repeat offenders:')
    lines.push(`  ${basename(offender.filePath)}:${offender.line ?? '?'} ${offender.ruleId ?? ''} (${offender.count}x)`)
  }
  for (const violation of diagStats.topViolations?.slice(0, 5) ?? []) {
    if (!lines.includes('Top noisy rules:')) lines.push('', 'Top noisy rules:')
    const sample = violation.samplePaths?.[0]
      ? ` (e.g. ${relativeish(state.projectRoot, violation.samplePaths[0])})`
      : ''
    lines.push(`  ${violation.ruleId}: ${violation.count}${sample}`)
  }
  const lspClients = getLSPService().getStatus() as Array<{ serverId: string; root: string; connected: boolean }>
  if (lspClients.length > 0) {
    lines.push('', 'LSP servers:')
    for (const client of lspClients) {
      const mark = client.connected ? 'ok' : 'down'
      const root = relativeish(state.projectRoot, client.root) || '.'
      lines.push(`  ${mark} ${client.serverId} (${root})`)
    }
  } else {
    lines.push('', 'LSP servers: none started')
  }
  const cascade = getCascadeSessionStats() as { runs: number; diagnosticsSurfaced: number; coldSnapshotTouches: number }
  if (cascade.runs > 0) {
    lines.push('', `Cascade runs: ${cascade.runs}`, `Cascade diagnostics surfaced: ${cascade.diagnosticsSurfaced}`)
    if (cascade.coldSnapshotTouches > 0) {
      lines.push(`Cold-snapshot touches: ${cascade.coldSnapshotTouches}`)
    }
  }
  const slop = getDispatchSlopScoreLine()
  if (slop) lines.push('', slop)
  return lines.join('\n')
}

export async function renderPerfReport(state: LensRuntime): Promise<string> {
  const report = await collectLatencyPerformance({
    sessionStartedAt: state.runtime.sessionStartedAt,
  })
  return renderLatencyPerformanceReport(report)
}

export async function renderToolsReport(): Promise<string> {
  const statuses = await getAllToolStatuses() as Array<{
    name: string
    installed?: boolean
    source?: string
    version?: string
    strategy?: string
    path?: string
  }>
  const groups = new Map<string, typeof statuses>()
  for (const status of statuses) {
    const key = status.source ?? 'unknown'
    const list = groups.get(key) ?? []
    list.push(status)
    groups.set(key, list)
  }
  const lines = [
    'PI-LENS TOOLS STATUS',
    '',
    `Installed: ${statuses.filter(item => item.installed).length}/${statuses.length}`,
  ]
  const labels: Record<string, string> = {
    'global-path': 'Global PATH',
    'npm-global': 'npm global',
    'pip-user': 'pip user',
    'github-release': 'GitHub releases',
    'pi-lens-auto': 'Auto-installed',
    'npx-fallback': 'npx fallback',
    'archive-dist': 'Archive bundle',
    'not-installed': 'Missing',
  }
  for (const [source, items] of groups) {
    if (items.length === 0) continue
    if (source === 'not-installed') {
      const missing = items.filter(item => item.strategy !== 'npm')
      if (missing.length === 0) continue
      lines.push('', `${labels[source] ?? source} (${missing.length}):`)
      for (const item of missing) lines.push(`  x ${item.name}`)
      continue
    }
    lines.push('', `${labels[source] ?? source} (${items.length}):`)
    for (const item of items) {
      const version = item.version ? ` (${item.version})` : ''
      lines.push(`  + ${item.name}${version}`)
    }
  }
  return lines.join('\n')
}

function relativeish(root: string, filePath: string): string {
  if (filePath.startsWith(root)) return filePath.slice(root.length).replace(/^[/\\]/, '') || '.'
  return filePath
}
