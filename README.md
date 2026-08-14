# dsh-lens

Real-time code feedback for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): LSP, linters, formatters, type-checking, and structural analysis while the agent writes.

English | [中文](#中文)

## What it does

This is a host-native port of [pi-lens](https://github.com/apmantza/pi-lens). The analysis engine stays in `pi-lens`; this plugin is the DeepSeek Harness adapter.

On every `write` / `edit` / `bash` mutation it runs the same pipeline pi-lens uses inside Pi:

1. format queue / safe autofix
2. LSP file sync and diagnostics
3. ast-grep, tree-sitter, fact rules, and language scanners
4. cascade diagnostics on likely neighbors
5. turn-end blockers and advisories injected into the next model request

It also registers the full agent-facing tool set and the `/lens-*` commands.

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

## Commands

`/lens-toggle` · `/lens-context-toggle` · `/lens-health` · `/lens-perf` · `/lens-tools` · `/lens-tdi` · `/lens-map` · `/lens-allow-edit <path>`

`/lens-widget-toggle` shows or hides the WebUI widget.

## WebUI

On the official dsh web profile the plugin ships a browser half (`dsh.client`):

- session header chip (`conversation.session.header.actions`) with counts and a popover of blockers
- composer dock strip (`conversation.input.dock`)
- search cards for `lens_diagnostics` / `ast_grep_search` / `symbol_search`

The chip reads the `lens` session projection, folded from widget-state on `tool/result`, `turn/end`, and `/lens-widget-toggle`. It does **not** append a custom session event, so persistence will not reject the log.

## Config

Same files as pi-lens:

- project: `.pi-lens.json`
- global: `~/.pi-lens/config.json`

Plugin config on the Cordis entry:

```yaml
- id: dsh-lens
  name: dsh-lens
  config:
    cwd: /path/to/workspace   # optional; defaults to process cwd / session header.cwd
    enabled: true
    contextInjection: true
```

## Host limits (honest)

dsh freezes tool arguments before dispatch, so Pi's in-flight edit autopatch (indent retarget / partial apply) cannot rewrite `old_string`. dsh already has its own read-before-edit observation policy. Everything else — on-write pipeline, format/autofix on disk, blockers, tools, commands, skills — is live.

## License

[MIT](LICENSE)

Inspired by [pi-lens](https://github.com/apmantza/pi-lens) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 DeepSeek Harness 用的实时代码反馈插件。分析引擎还是 [pi-lens](https://github.com/apmantza/pi-lens)，这里是 dsh 宿主适配：写文件后跑 format / LSP / linter / 结构规则，并把 blocker 注回下一轮。

```sh
dsh plugin --profile web add dsh-lens
```
