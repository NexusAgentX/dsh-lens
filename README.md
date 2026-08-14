# dsh-lens

Real-time code feedback for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): LSP, linters, formatters, type-checking, and structural analysis while the agent writes.

Current release: **`dsh-lens@0.2.0`**.

English | [中文](#中文)

## What it does

This is a host-native port of [pi-lens](https://github.com/apmantza/pi-lens). The analysis engine stays in `pi-lens`; this plugin is the DeepSeek Harness adapter.

On every `write` / `edit` / `bash` mutation it runs the same pipeline pi-lens uses inside Pi:

1. format queue / safe autofix
2. LSP file sync and diagnostics
3. ast-grep, tree-sitter, fact rules, and language scanners
4. cascade diagnostics on likely neighbors
5. turn-end blockers and advisories injected into the next model request

It also registers the full agent-facing tool set, the `/lens-*` commands, bundled pi-lens skills, and a WebUI chip/dock.

Standalone CLI (review graph, same as `pi-lens build-graph`):

```sh
npx dsh-lens build-graph --cwd .
npx dsh-lens status
```

## Install

```sh
dsh plugin --profile web add dsh-lens
```

Or from git:

```sh
dsh plugin --profile web add github:NexusAgentX/dsh-lens
```

Do **not** also attach `pi-lens-mcp` / official MCP-wrapped pi-lens against the same workspace — that double-starts language servers.

## Tools

Always available:

- `lens_diagnostics` — cached / project diagnostic state (`delta` / `all` / `full`)
- `lsp_diagnostics` — file- or directory-scoped LSP diagnostics
- `symbol_search` — ranked identifier search
- `module_report` / `project_report`
- `read_symbol` / `read_enclosing`

Also registered (dsh has no dynamic-tool API, so they stay visible):

- `ast_grep_search` / `ast_grep_replace` / `ast_grep_outline` / `ast_grep_dump`
- `lsp_navigation`
- `lens_diagnostic_mark`
- `pi_lens_activate_tools` — no-op catalog on dsh; all tools are already active

The official `lsp` tool is left alone. Use it for simple go-to; use `lsp_navigation` for the full IDE surface.

`lens_diagnostics`, `ast_grep_search`, and `symbol_search` present as search cards with file follow-along.

## Commands

| Command | What it does |
|---|---|
| `/lens-toggle` | Enable or disable the pipeline for this session |
| `/lens-context-toggle` | Keep tools/LSP/format on, stop injecting into the next turn |
| `/lens-widget-toggle` | Show or hide the WebUI chip and dock |
| `/lens-health` | Session health, LSP list, cascade, event-loop, noisy rules |
| `/lens-perf` | Process + machine-wide p50/p99 phase ranking |
| `/lens-tools` | Installer status grouped by source |
| `/lens-tdi` | Technical Debt Index |
| `/lens-map` | Write the HTML dependency map; the chip gets an Open map action |
| `/lens-allow-edit <path>` | One-shot read-guard exemption |

## WebUI

On the official dsh web profile the plugin ships a browser half (`dsh.client`):

- session header chip (`conversation.session.header.actions`)
- composer dock (`conversation.input.dock`)
- official primitives: `Menu`, `Tooltip`, `StateDot`, chevron, CSS modules, zh/en locale

The chip reads the `lens` session projection, folded from widget-state on `tool/result`, `turn/end`, and `/lens-widget-toggle`. It does **not** append a custom session event, so persistence will not reject the log.

## Skills

The four upstream pi-lens skills are registered when `ctx.skills` is present:

- `pi-lens-ast-grep`
- `pi-lens-lsp-navigation`
- `pi-lens-write-ast-grep-rule`
- `pi-lens-write-tree-sitter-rule`

## Config

Same files as pi-lens:

- project: `.pi-lens.json`
- global: `~/.pi-lens/config.json`

Plugin config on the Cordis entry (omit a key to keep `.pi-lens.json` / env):

```yaml
- id: dsh-lens
  name: dsh-lens
  config:
    cwd: /path/to/workspace
    enabled: true
    contextInjection: true
    lsp: true
    format: true
    immediateFormat: false
    autofix: true
    tests: true
    delta: true
    guard: false
    opengrep: true
    readGuard: true
    turnSummary: false
    actionableWarnings: false
    actionableWarningActions: false
    actionableWarningAutofix: false
    actionableWarningAll: false
```

Boolean keys map onto the same flags as pi-lens (`--no-lsp`, `--lens-guard`, `--immediate-format`, …).

## Host limits

dsh freezes tool arguments before dispatch, so Pi's in-flight edit autopatch cannot rewrite `old_string`. dsh already has its own read-before-edit observation policy.

These Pi host surfaces are not cloned: TUI footer, interactive LSP install prompts, session fork / cross-process nudge, official Settings cards (apiproxy allowlist), and `/lens-booboo` (still deferred upstream).

## License

[MIT](LICENSE)

Inspired by [pi-lens](https://github.com/apmantza/pi-lens) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的实时代码反馈插件。分析引擎还是 [pi-lens](https://github.com/apmantza/pi-lens)，这里是 dsh 宿主适配：写文件后跑 format / LSP / linter / 结构规则，并把 blocker 注回下一轮。

当前版本：`dsh-lens@0.2.0`。

```sh
dsh plugin --profile web add dsh-lens
```

Web profile 会装上会话标题旁的 lens 芯片和输入框上面的 dock（官方 Menu / Tooltip / StateDot）。`/lens-widget-toggle` 可隐藏。`/lens-health`、`/lens-perf`、`/lens-tools` 与上游报告对齐。

不要和 `pi-lens-mcp` 同时挂同一批 workspace，会双开语言服务器。

配置继续用 `.pi-lens.json` / `~/.pi-lens/config.json`，也可以在 Cordis 条目里写 `lsp` / `format` / `guard` 等开关。
