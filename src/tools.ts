import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { createAstGrepDumpTool } from 'pi-lens/dist/tools/ast-dump.js'
import { createAstGrepOutlineTool } from 'pi-lens/dist/tools/ast-grep-outline.js'
import { createAstGrepReplaceTool } from 'pi-lens/dist/tools/ast-grep-replace.js'
import { createAstGrepSearchTool } from 'pi-lens/dist/tools/ast-grep-search.js'
import { createActivateToolsTool } from 'pi-lens/dist/tools/activate-tools.js'
import { createLensDiagnosticMarkTool } from 'pi-lens/dist/tools/lens-diagnostic-mark.js'
import { createLensDiagnosticsTool } from 'pi-lens/dist/tools/lens-diagnostics.js'
import { createLspDiagnosticsTool } from 'pi-lens/dist/tools/lsp-diagnostics.js'
import { createLspNavigationTool } from 'pi-lens/dist/tools/lsp-navigation.js'
import {
  createModuleReportTool,
  createReadEnclosingTool,
  createReadSymbolTool,
} from 'pi-lens/dist/tools/module-report.js'
import { createProjectReportTool } from 'pi-lens/dist/tools/project-report.js'
import { createSymbolSearchTool } from 'pi-lens/dist/tools/symbol-search.js'
import { flushDebouncedToolResults } from 'pi-lens/dist/clients/runtime-tool-result.js'
import { extractResultText, jsonSafe, resolveFilePath, asRecord } from './events.js'
import { logger } from './logger.js'
import type { LensRuntime } from './runtime.js'
import { toJsonSchema } from './schema.js'

interface PiTool {
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

const LAZY_TOOL_CATALOG = [
  { name: 'ast_grep_search', summary: 'AST-aware structural code search across ~40 languages.' },
  { name: 'ast_grep_replace', summary: 'AST-aware structural rewrite/refactor.' },
  { name: 'ast_grep_outline', summary: 'Syntax-only file/dir structure via ast-grep outline.' },
  { name: 'ast_grep_dump', summary: 'Dump the tree-sitter AST for a source snippet.' },
  { name: 'lsp_navigation', summary: 'IDE-style LSP navigation: definition, references, rename, call hierarchy.' },
  { name: 'lens_diagnostic_mark', summary: 'Triage a diagnostic: false-positive / suppress / defer / flagged.' },
]

export function createPiTools(state: LensRuntime): PiTool[] {
  const getRoot = () => state.projectRoot
  const alwaysActive: PiTool[] = [
    createLensDiagnosticsTool(
      state.cacheManager,
      getRoot,
      undefined,
      () => flushDebouncedToolResults(),
      () => state.runtime.nextWriteIndex(),
    ) as PiTool,
    createLspDiagnosticsTool(() => state.runtime.nextWriteIndex()) as PiTool,
    createSymbolSearchTool(getRoot) as PiTool,
    createProjectReportTool(getRoot) as PiTool,
    createModuleReportTool(getRoot) as PiTool,
    createReadSymbolTool(
      getRoot,
      (filePath: string, symbol: unknown) => state.runtime.readGuard.recordSymbolRead(
        filePath,
        symbol,
        state.runtime.turnIndex,
        state.runtime.peekWriteIndex(),
      ),
    ) as PiTool,
    createReadEnclosingTool(
      getRoot,
      (filePath: string, symbol: unknown) => state.runtime.readGuard.recordSymbolRead(
        filePath,
        symbol,
        state.runtime.turnIndex,
        state.runtime.peekWriteIndex(),
      ),
    ) as PiTool,
  ]

  const lazy: PiTool[] = [
    createAstGrepSearchTool(state.astGrepClient) as PiTool,
    createAstGrepReplaceTool(state.astGrepClient) as PiTool,
    createAstGrepOutlineTool(state.astGrepClient) as PiTool,
    createAstGrepDumpTool(state.astGrepClient) as PiTool,
    createLspNavigationTool((name: string, cwd?: string) => state.getFlag(name, cwd), {
      runtime: state.runtime,
      cacheManager: state.cacheManager,
      readGuard: state.runtime.readGuard,
      dbg: (message: string) => logger.debug(message),
    }) as PiTool,
    createLensDiagnosticMarkTool(getRoot) as PiTool,
  ]

  const activate = createActivateToolsTool(
    {
      getActiveTools: () => [...alwaysActive, ...lazy].map(tool => tool.name),
      setActiveTools: () => undefined,
    },
    LAZY_TOOL_CATALOG,
  ) as PiTool

  return [...alwaysActive, activate, ...lazy]
}

export function wrapPiTool(tool: PiTool): {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
  }
  presentCall: (args: unknown) => { card: 'generic'; title: string; kind: 'search' | 'read' | 'other'; locations?: Array<{ path: string }> }
  timeoutMs: number
  execute: (args: unknown, exec: { signal: AbortSignal; token?: unknown }) => Promise<unknown>
} {
  return {
    name: tool.name.slice(0, 64),
    description: tool.description,
    parameters: toJsonSchema(tool.parameters),
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: extractResultText(value) }],
    },
    presentCall(args) {
      const path = resolveFilePath(asRecord(args))
      const kind = tool.name.includes('search') || tool.name.includes('diagnostics')
        ? 'search'
        : tool.name.startsWith('read') || tool.name.includes('report')
          ? 'read'
          : 'other'
      return {
        card: 'generic',
        title: tool.label ?? tool.name,
        kind,
        ...path ? { locations: [{ path }] } : {},
      }
    },
    timeoutMs: 180_000,
    async execute(args, exec) {
      const result = await tool.execute(
        String(exec.token ?? tool.name),
        asRecord(args),
        exec.signal,
        undefined,
      )
      const text = (result.content ?? []).map(block => block.text ?? '').join('\n')
      if (result.isError) throw new Error(text || `${tool.name} failed`)
      return jsonSafe({ text, details: result.details ?? null })
    },
  }
}

export function registerLensTools(ctx: Context, state: LensRuntime): void {
  for (const tool of createPiTools(state)) {
    try {
      ctx.tools.register(wrapPiTool(tool))
    } catch (error) {
      logger.warn(`skipped tool ${tool.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
