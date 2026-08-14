# dsh-lens

Real-time code feedback for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): LSP, linters, formatters, type-checking, and structural analysis while the agent writes.

`0.0.1` is a **name reservation + installable bundle stub**. The host-native pipeline lands next.

English | [中文](#中文)

## Why this exists

[pi-lens](https://github.com/apmantza/pi-lens) already solved the product: on every write/edit it runs format/autofix, LSP, ast-grep, tree-sitter, and language-specific scanners, then injects blockers into the next turn. The engine is host-neutral (`clients/lens-engine.ts`). Pi coupling lives in `index.ts`; there is already a second host adapter as `pi-lens-mcp`.

DeepSeek Harness has official [`dsh-tool-lsp`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/lsp/tool-lsp), but that is a **pull** navigation tool (`goToDefinition` / `findReferences` / `hover`). It does not run the on-write pipeline, does not inject diagnostics, and does not cover linters / formatters / structural rules.

This plugin ports the pi-lens **product contract** onto dsh. It does **not** fork the Pi host layer, and it does **not** replace the official `lsp` tool.

## Status

| Piece | 0.0.1 |
|---|---|
| npm name `dsh-lens` | reserved |
| `dsh plugin add` bundle stub | yes |
| write/edit pipeline (`tools/before` + `tools/result`) | not yet |
| turn-end diagnostic injection | not yet |
| agent tools (`lens_diagnostics`, ast-grep, symbol search) | not yet |
| `/lens` status command | not yet |

## Install

```sh
dsh plugin --profile web add dsh-lens
```

The stub loads and prints a placeholder log line. It does not analyze code yet.

## Planned shape

- a Cordis bundle that calls the host-neutral lens engine
- hook `tools/before` / `tools/result` for write/edit, `turn/end` for blockers
- inject findings through `ctx.systemPrompt` / additional context, not a second `lsp` tool
- keep official `lsp` for navigation; add lens-only tools (`lens_diagnostics`, `ast_grep_search`, `symbol_search`)
- reuse `.pi-lens.json` / `~/.pi-lens/config.json` so existing project config still works

It is an independent plugin. It is not affiliated with DeepSeek AI.

## License

[MIT](LICENSE)

Inspired by [pi-lens](https://github.com/apmantza/pi-lens) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的实时代码反馈插件：写文件时跑 LSP / linter / formatter / 结构规则，并把 blocker 注回下一轮。

`0.0.1` 只抢注 npm 名并提供可安装的 bundle 占位。实现随后补上。

```sh
dsh plugin --profile web add dsh-lens
```
