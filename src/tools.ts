import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
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
import { Type } from 'pi-lens/dist/clients/deps/typebox.js'
import { CodeIndexer, resolveConfig } from 'dsh-code-intel'
import { flushDebouncedToolResults } from 'pi-lens/dist/clients/runtime-tool-result.js'
import { presentLensCall, searchMetaFromValue } from './cards.js'
import { extractResultText, jsonSafe, asRecord } from './events.js'
import { logger } from './logger.js'
import type { LensRuntime } from './runtime.js'
import { sessionCwd } from './context.js'
import { TOOL_OUTPUT_SCHEMA, toJsonSchema } from './schema.js'

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
    ctx?: { cwd?: string; signal?: AbortSignal; agent?: unknown },
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

/**
 * Aggregate the always-active flat pi-lens tools into one action-based
 * `code_intel` tool.
 *
 * The inner factories are reused unchanged (state wiring and read-guard
 * bookkeeping are preserved); only the tool surface is collapsed. This
 * mirrors the action-based `code_intel` tool shipped by the harness itself
 * and keeps the per-round tool schema payload low: N flat schemas that the
 * harness injects every round become one.
 *
 * `search` / `outline` are served by a self-owned `CodeIndexer` from the
 * `dsh-code-intel` package, reused here as a library (that package is not
 * modified).
 */
export function createCodeIntelTool(state: LensRuntime, ctx: Context): PiTool {
  const getRoot = () => state.sessionCwd ?? state.projectRoot
  const recordRead = (filePath: string, symbol: unknown) => state.runtime.readGuard.recordSymbolRead(
    filePath,
    symbol,
    state.runtime.turnIndex,
    state.runtime.peekWriteIndex(),
  )
  let ciIndexer: CodeIndexer | null = null
  const getCodeIntel = (): CodeIndexer => {
    if (!ciIndexer) {
      ciIndexer = new CodeIndexer(ctx, resolveConfig({
        embedding: {
          provider: 'openai-compatible',
          endpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
          model: 'embedding-3',
          credentialRef: 'GLM_CODE_EMBEDDING_KEY',
          batchSize: 32,
        },
      }))
    }
    return ciIndexer
  }
  // CodeIndexer reads the dsh executor shape (exec.agent.session.header.cwd /
  // exec.signal). The pi shim context (5th execute arg, { cwd, signal }) is
  // enough to synthesize one, so no wrapPiTool changes are required.
  // Prefer forwarding the real agent when the caller provides one:
  // session-scoped services (e.g. background-job ownership checks) resolve
  // against the session-level agent context, and a synthetic plugin-level
  // agent fails that check ("no job controller serves this agent"). The real
  // agent carries both session.header.cwd and its own ctx, and background
  // builds started with it are owned by the calling session (and cleaned up
  // when it closes). The synthetic fallback only serves call paths that
  // carry no agent.
  const fakeExec = (c2: { cwd?: string; signal?: AbortSignal; agent?: unknown }): ToolExecution =>
    ({ agent: c2.agent ?? { session: { header: { cwd: c2.cwd } } }, signal: c2.signal }) as unknown as ToolExecution
  const inner: Record<string, PiTool | null> = {
    symbol_search: createSymbolSearchTool(getRoot) as PiTool,
    project_report: createProjectReportTool(getRoot) as PiTool,
    module_report: createModuleReportTool(getRoot) as PiTool,
    read_symbol: createReadSymbolTool(getRoot, recordRead) as PiTool,
    read_enclosing: createReadEnclosingTool(getRoot, recordRead) as PiTool,
    // `search` / `outline` are served by the CodeIndexer above.
    search: null,
    outline: null,
  }
  return {
    name: 'code_intel',
    label: 'Code Intel',
    description: 'Seven code tools in one. action=search: workspace code search (symbol-aware chunks, lexical or hybrid). outline: AST declarations for one file/dir before broad reads. symbol_search: ranked identifier search. module_report: file outline + who-uses-this. read_symbol: exact symbol body. read_enclosing: smallest body around a line. project_report: repo orientation. Triggers: find code, read a body, orient. (LSP diagnostics live in lens(action=lsp_diagnostics).)',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('search'),
        Type.Literal('outline'),
        Type.Literal('symbol_search'),
        Type.Literal('module_report'),
        Type.Literal('project_report'),
        Type.Literal('read_symbol'),
        Type.Literal('read_enclosing'),
      ], { description: 'Which sub-operation to run.' }),
      query: Type.Optional(Type.String({ description: 'search/symbol_search: concept, behavior, API, or symbol to find.' })),
      limit: Type.Optional(Type.Number({ description: 'search/symbol_search/project_report: max results (default 20 / 20 / 10).' })),
      paths: Type.Optional(Type.Array(Type.String(), { description: 'symbol_search: glob scope array.' })),
      lang: Type.Optional(Type.String({ description: 'symbol_search: restrict language (typescript, python, go...).' })),
      path: Type.Optional(Type.String({ description: 'module_report/read_symbol/read_enclosing/outline: file or directory path.' })),
      view: Type.Optional(Type.String({ description: 'module_report/project_report: payload tier (summary/default/compact).' })),
      focus: Type.Optional(Type.String({ description: 'module_report/project_report: task hint to rank sections.' })),
      blastRadius: Type.Optional(Type.Boolean({ description: 'module_report: include transitive dependents.' })),
      blastRadiusDepth: Type.Optional(Type.Number({ description: 'module_report: max hops (default 3).' })),
      maxRefsPerSymbol: Type.Optional(Type.Number({ description: 'module_report: cap who-uses entries (default 10).' })),
      symbol: Type.Optional(Type.String({ description: 'read_symbol: exact symbol name (dotted Class.method ok).' })),
      kind: Type.Optional(Type.String({ description: 'read_symbol: disambiguate kind (function/class...).' })),
      line: Type.Optional(Type.Number({ description: 'read_enclosing: 1-based line inside the target body.' })),
      kinds: Type.Optional(Type.Array(Type.String(), { description: 'read_enclosing: filter kinds (function/method/callback...).' })),
      maxLines: Type.Optional(Type.Number({ description: 'read_enclosing: body size cap (default 80).' })),
      onOversize: Type.Optional(Type.String({ description: 'read_enclosing: error|slice|outline (default error).' })),
      aroundLine: Type.Optional(Type.Number({ description: 'read_enclosing: slice window when onOversize=slice.' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, execCtx) {
      const args = asRecord(params) ?? {}
      const action = args.action
      const { action: _drop, ...rest } = args
      if (action === 'search' || action === 'outline') {
        const idx = getCodeIntel()
        const fx = fakeExec(execCtx ?? { cwd: getRoot(), signal })
        // Default limit 20 matches the parameter description; CodeIndexer
        // expects a numeric limit.
        const r = action === 'search'
          ? await idx.search(String(rest.query ?? '').trim(), Number(rest.limit ?? 20), fx)
          : await idx.outline(String(rest.path ?? '').trim(), fx)
        // CodeIndexer returns plain objects — wrap into the pi tool shape.
        return { content: [{ type: 'text', text: JSON.stringify(r) }], isError: false, details: r }
      }
      const tool = action === undefined ? undefined : inner[String(action)]
      if (!tool) {
        throw new Error(`code_intel: unknown action "${String(action)}" (expected one of ${Object.keys(inner).join('/')})`)
      }
      return tool.execute(toolCallId, rest, signal, onUpdate, execCtx)
    },
  }
}

/**
 * Merge the two diagnostic tools (`lens_diagnostics` + `lsp_diagnostics`)
 * into one action-based `lens` tool. Both factories are reused unchanged;
 * only the tool surface is collapsed (same aggregation pattern as
 * `code_intel` above).
 */
export function createLensTool(state: LensRuntime, getRoot: () => string): PiTool {
  const inner: Record<string, PiTool> = {
    diagnostics: createLensDiagnosticsTool(
      state.cacheManager,
      getRoot,
      undefined,
      () => flushDebouncedToolResults(),
      () => state.runtime.nextWriteIndex(),
    ) as PiTool,
    lsp_diagnostics: createLspDiagnosticsTool(() => state.runtime.nextWriteIndex()) as PiTool,
  }
  return {
    name: 'lens',
    label: 'Lens',
    description: 'Two diagnostic tools in one. action=diagnostics: pi-lens runner state - LSP errors, tree-sitter structural rules, lint/complexity findings (mode=delta default / all session / full active project scan; refreshRunners for fresh heavyweight analysis). action=lsp_diagnostics: proactive LSP type/error check on files, folders, or batches - run before declaring code work done.',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('diagnostics'),
        Type.Literal('lsp_diagnostics'),
      ], { description: 'Which sub-operation to run.' }),
      mode: Type.Optional(Type.String({ description: 'diagnostics: delta|all|full (default delta).' })),
      refreshRunners: Type.Optional(Type.Union([Type.String(), Type.Boolean()], { description: 'diagnostics: none|cheap|all - run fresh heavyweight analyzers.' })),
      severity: Type.Optional(Type.String({ description: 'both: error|warning|information|hint|all.' })),
      paths: Type.Optional(Type.Array(Type.String(), { description: 'both: explicit file/directory scope (max 200).' })),
      maxProjectFiles: Type.Optional(Type.Number({ description: 'diagnostics: cap cheap project-runner scan.' })),
      maxLspFiles: Type.Optional(Type.Number({ description: 'diagnostics: cap LSP sweep.' })),
      concurrency: Type.Optional(Type.Number({ description: 'lsp_diagnostics: batch concurrency (max 16).' })),
      waitMs: Type.Optional(Type.Number({ description: 'lsp_diagnostics: per-file wait budget ms.' })),
      serverScope: Type.Optional(Type.String({ description: 'lsp_diagnostics: primary|all.' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, execCtx) {
      const args = asRecord(params) ?? {}
      const action = args.action
      const { action: _drop, ...rest } = args
      const tool = action === undefined ? undefined : inner[String(action)]
      if (!tool) {
        throw new Error(`lens: unknown action "${String(action)}" (expected diagnostics/lsp_diagnostics)`)
      }
      return tool.execute(toolCallId, rest, signal, onUpdate, execCtx)
    },
  }
}

export function createPiTools(state: LensRuntime, ctx: Context): PiTool[] {
  const getRoot = () => state.sessionCwd ?? state.projectRoot
  const alwaysActive: PiTool[] = [
    // lens: the two diagnostic tools merged into one action-based tool.
    createLensTool(state, getRoot),
    // code_intel: the flat always-active pi-lens tools collapsed into one
    // action-based tool (drops several per-round schemas; every action and
    // its parameters stay reachable through the `action` field).
    createCodeIntelTool(state, ctx),
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

export function wrapPiTool(tool: PiTool, state?: LensRuntime): ToolDefinition {
  const definition = {
    name: tool.name.slice(0, 64),
    description: tool.description,
    parameters: toJsonSchema(tool.parameters),
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: extractResultText(value) }],
      presentationMeta: (args: unknown, value: unknown) => searchMetaFromValue(tool.name, args, value) ?? null,
    },
    presentCall(args: unknown) {
      return presentLensCall(tool.name, tool.label, args)
    },
    presentResult(args: unknown, result: { meta?: unknown }) {
      const meta = searchMetaFromValue(tool.name, args, result.meta) ?? searchMetaFromValue(tool.name, args, result)
      if (meta) return meta
      return { card: 'generic', title: tool.label ?? tool.name }
    },
    timeoutMs: 180_000,
    async execute(args: unknown, exec: { signal: AbortSignal; token?: unknown; agent?: { session?: { header?: { cwd?: unknown } } } }) {
      const cwd = sessionCwd(exec.agent, state?.sessionCwd ?? state?.projectRoot ?? process.cwd())
      if (state) state.sessionCwd = cwd
      const result = await tool.execute(
        String(exec.token ?? tool.name),
        asRecord(args),
        exec.signal,
        undefined,
        // Forward the real agent so session-scoped services inside the tools
        // (e.g. the code_intel CodeIndexer scheduling background builds) see
        // the calling session's identity. Other pi tools ignore this field.
        { cwd, signal: exec.signal, agent: exec.agent },
      )
      const text = (result.content ?? []).map(block => block.text ?? '').join('\n')
      if (result.isError) throw new Error(text || `${tool.name} failed`)
      return jsonSafe({ text, details: result.details ?? null })
    },
  }
  return definition as ToolDefinition
}

export function registerLensTools(ctx: Context, state: LensRuntime): void {
  for (const tool of createPiTools(state, ctx)) {
    try {
      ctx.tools.register(wrapPiTool(tool, state))
    } catch (error) {
      logger.warn(`skipped tool ${tool.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
