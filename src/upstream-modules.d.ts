declare module 'pi-lens/dist/clients/runtime-session.js' {
  export function handleSessionStart(deps: Record<string, unknown>): Promise<void>
}

declare module 'pi-lens/dist/clients/runtime-turn.js' {
  export function handleTurnEnd(deps: Record<string, unknown>): Promise<void>
  export function cancelLSPIdleReset(): void
}

declare module 'pi-lens/dist/clients/runtime-tool-call.js' {
  export function handleToolCall(deps: Record<string, unknown>): Promise<{ block: true; reason?: string } | void>
}

declare module 'pi-lens/dist/clients/runtime-tool-result.js' {
  export function handleToolResult(deps: Record<string, unknown>): Promise<{
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
  } | void>
  export function flushDebouncedToolResults(): Promise<void>
}

declare module 'pi-lens/dist/clients/runtime-agent-end.js' {
  export function handleAgentEnd(deps: Record<string, unknown>): Promise<unknown>
}

declare module 'pi-lens/dist/clients/runtime-coordinator.js' {
  export class RuntimeCoordinator {
    projectRoot: string
    turnIndex: number
    sessionStartedAt: number
    readGuard: {
      addExemption(path: string): void
      recordSymbolRead(filePath: string, symbol: unknown, turnIndex: number, writeIndex: number): void
    }
    nextWriteIndex(): number
    peekWriteIndex(): number
    getCrashEntries(): Array<[string, number]>
  }
}

declare module 'pi-lens/dist/clients/runtime-context.js' {
  export function consumeSessionStartGuidance(cache: unknown, cwd: string): { messages: Array<{ content: string }> } | undefined
  export function consumeTurnEndFindings(cache: unknown, cwd: string): { messages: Array<{ content: string }> } | undefined
  export function consumeTestFindings(cache: unknown, cwd: string): { messages: Array<{ content: string }> } | undefined
}

declare module 'pi-lens/dist/clients/cache-manager.js' {
  export class CacheManager {}
}

declare module 'pi-lens/dist/clients/ast-grep-client.js' {
  export class AstGrepClient {}
}

declare module 'pi-lens/dist/clients/bootstrap.js' {
  export function loadBootstrapClients(): Promise<Record<string, unknown>>
}

declare module 'pi-lens/dist/clients/mcp/host-shim.js' {
  export function createMcpHost(
    overrides?: Record<string, boolean | string | undefined>,
    projectRoot?: string,
  ): { getFlag(name: string, filePath?: string): boolean | string | undefined }
}

declare module 'pi-lens/dist/clients/lsp/index.js' {
  export function getLSPService(): {
    getAliveClientCount(): number
    getStatus(): Array<{ serverId: string; root: string; connected: boolean }>
  }
  export function resetLSPService(options?: unknown): void
}

declare module 'pi-lens/dist/clients/lsp/config.js' {
  export function initLSPConfig(cwd: string): Promise<void>
}

declare module 'pi-lens/dist/clients/format-service.js' {
  export function getFormatService(): unknown
  export function resetFormatService(): void
}

declare module 'pi-lens/dist/clients/dispatch/integration.js' {
  export function resetDispatchBaselines(cwd?: string): void
  export function getLatencyReports(): Array<{
    filePath?: string
    totalDurationMs?: number
    runners?: Array<{ name?: string; runnerId?: string; durationMs: number; status?: string }>
    totalDiagnostics?: number
  }>
  export function getDispatchSlopScoreLine(): string | undefined
  export function getCascadeSessionStats(): { runs: number; diagnosticsSurfaced: number; coldSnapshotTouches: number }
}

declare module 'pi-lens/dist/clients/event-loop-monitor.js' {
  export function getEventLoopStats(): { maxMs: number; p99Ms: number; meanMs: number } | undefined
}

declare module 'pi-lens/dist/clients/performance-report.js' {
  export function collectLatencyPerformance(options: { sessionStartedAt?: number }): Promise<unknown>
  export function renderLatencyPerformanceReport(report: unknown): string
}

declare module 'pi-lens/dist/clients/installer/index.js' {
  export function ensureTool(name: string): Promise<string | null | undefined>
  export function getAllToolStatuses(): Promise<Array<{
    name: string
    installed?: boolean
    status?: string
    source?: string
    version?: string
    strategy?: string
    path?: string
  }>>
}

declare module 'pi-lens/dist/clients/diagnostic-tracker.js' {
  export function getDiagnosticTracker(): { getStats(): Record<string, unknown> }
}

declare module 'pi-lens/dist/clients/metrics-history.js' {
  export function loadHistory(): unknown
  export function computeTDI(history: unknown): {
    score: number
    grade: string
    filesAnalyzed: number
    filesWithDebt: number
    avgMI: number
    totalCognitive: number
    byCategory: Record<string, number>
  }
}

declare module 'pi-lens/dist/clients/lens-map.js' {
  export function generateLensMap(cwd: string): Promise<{
    filePath: string
    fileCount: number
    edgeCount: number
    externalCount: number
    testFileCount: number
    compiledTwinCount: number
    ignoredFileCount: number
    truncated?: boolean
  }>
}

declare module 'pi-lens/dist/tools/lens-diagnostics.js' {
  export function createLensDiagnosticsTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/lsp-diagnostics.js' {
  export function createLspDiagnosticsTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/symbol-search.js' {
  export function createSymbolSearchTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/project-report.js' {
  export function createProjectReportTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/module-report.js' {
  export function createModuleReportTool(...args: unknown[]): PiLensTool
  export function createReadSymbolTool(...args: unknown[]): PiLensTool
  export function createReadEnclosingTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/ast-grep-search.js' {
  export function createAstGrepSearchTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/ast-grep-replace.js' {
  export function createAstGrepReplaceTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/ast-grep-outline.js' {
  export function createAstGrepOutlineTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/ast-dump.js' {
  export function createAstGrepDumpTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/lsp-navigation.js' {
  export function createLspNavigationTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/tools/lens-diagnostic-mark.js' {
  export function createLensDiagnosticMarkTool(...args: unknown[]): PiLensTool
}

declare module 'pi-lens/dist/clients/widget-state.js' {
  export function exportWidgetState(): {
    sessionLanguages?: string[]
    files?: Array<{
      filePath: string
      touchedAt?: number
      diagnosticCounts?: { blocking?: number; errors?: number; warnings?: number }
      allDiagnostics?: Array<{ semantic?: string; severity?: string; line?: number; rule?: string; message?: string }>
      diagnostics?: Array<{ semantic?: string; severity?: string; line?: number; rule?: string; message?: string }>
    }>
  }
  export function getSessionLanguages(): string[]
  export function getFailedLspServerIds(): string[]
}

declare module 'pi-lens/dist/tools/activate-tools.js' {
  export function createActivateToolsTool(...args: unknown[]): PiLensTool
}

interface PiLensTool {
  name: string
  label?: string
  description: string
  parameters?: unknown
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
  ): Promise<{
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
    details?: unknown
  }>
}
