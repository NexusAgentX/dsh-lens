# dsh-lens

> **This is an unofficial, community-maintained fork, maintained by [El1ver](https://github.com/El1mir).**
> It is **not** affiliated with, endorsed by, or published by the upstream `NexusAgentX` project.
> All changes relative to upstream are recorded in [CHANGELOG.md](CHANGELOG.md).

Real-time code feedback for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — LSP, linters, formatters, type-checking, and structural analysis, run while the agent is still writing.

Current release: **`dsh-lens@0.3.3`** (compatible with DSH `>=0.2.0`).

English | [中文](#中文)

---

## Why this fork exists

Upstream `dsh-lens` works, but it had a problem that only shows up in long sessions: **every diagnosis was injected as a separate user message, and that message replayed forever.**

The old path serialized the entire `write` / `edit` result value — `{path, operation, before, after}`, including *both complete file bodies* — into `event.content`, handed that to pi-lens, and then injected every block pi-lens returned. So each edit pushed the file's old and new contents into the conversation history, where they were replayed on every subsequent request and never reclaimed.

Measured across six large sessions:

| Metric | Value |
| --- | --- |
| Share of every request's replayed history taken by `dsh-lens/notice` | **65–69%** |
| Worst single session | 298 notices, **7,583,170 chars** — more than all real tool results combined |
| Useful diagnostic text inside a 20K-char notice (median) | **25–154 chars** |
| Signal-to-noise ratio | **1:80 … 1:800** |

This fork replaces that channel. Diagnostics now ride on the tool result itself. See [Injection](#injection).

## What it does

This is a host-native port of [pi-lens](https://github.com/apmantza/pi-lens). The analysis engine stays in `pi-lens`; this plugin is the DeepSeek Harness adapter.

On every `write` / `edit` / `bash` mutation it runs the same pipeline pi-lens uses inside Pi:

1. format queue / safe autofix
2. LSP file sync and diagnostics
3. ast-grep, tree-sitter, fact rules, and language scanners
4. cascade diagnostics on likely neighbors
5. blockers and advisories fed back to the model

It also registers the full agent-facing tool set, the `/lens-*` commands, bundled pi-lens skills, and a composer status pill.

Standalone CLI (review graph, same as `pi-lens build-graph`):

```sh
npx dsh-lens build-graph --cwd .
npx dsh-lens status
```

## Install

From npm:

```sh
dsh plugin --profile web add dsh-lens
```

From this fork's git remote — **use this one if you want the fixes described above**, since the npm package and the upstream repo do not carry them:

```sh
dsh plugin --profile web add github:El1mir/dsh-lens
```

To build and install from a local checkout:

```powershell
# Windows
pwsh ./install-dsh.ps1
```

```sh
npm install && npm run build && npm test
dsh plugin --profile web add "$(pwd)"
```

Do **not** also attach `pi-lens-mcp` / the official MCP-wrapped pi-lens against the same workspace — that double-starts language servers.

## Injection

This is the core difference from upstream. Diagnostics are attached to the tool result, not sent as a message.

A `write` / `edit` that leaves 🔴 blockers gets a bounded summary appended to its own result content:

```
🔴 src/foo.ts — 2 blockers: L42 unused import; L88 no-explicit-any
→ lens_diagnostics mode=all
```

- **A clean edit injects nothing at all.** The old `✓ <lang> clean · <n>ms` all-clear line is no longer a message.
- **`read` / `bash` / `grep` / `glob` results are never touched** — not one byte. Only `write` / `edit` can carry a summary.
- **The attachment is capped at 200 characters**, hint included, with a 3-blocker list cap and a 60-char per-message cap.
- **Silence means clean — but a failed analysis still reports.** A pi-lens pipeline crash is surfaced, so "no summary" can never be misread as "no problems".

Two things stop it repeating itself:

| Guard | Behaviour |
| --- | --- |
| `reportedSnapshots` | An unchanged blocker set is not re-attached on the next edit of the same file. Session memory only — a fresh session restates current problems once, and the key includes message text, so *fixing one and introducing another* is not mistaken for "nothing changed". |
| `⚠️ auto-fixed N, file modified — re-read` | **Exempt** from suppression. It reports a new disk state, not a known problem. |

Turn-end findings (`dead-code`, call-graph impact, test results) stay a separate message — they only exist once the turn is over and cannot ride on a tool result — but each block is capped to its first paragraph (≤200 chars). The opt-in `lens-turn-summary` dock is exempt: it is a status panel, not a finding.

### Turning it off

`compactInjection` is orthogonal to `contextInjection`:

| `contextInjection` | `compactInjection` | Behaviour |
| --- | --- | --- |
| `false` | either | nothing is injected at all |
| `true` | `true` (default) | bounded summary on the tool result |
| `true` | `false` | legacy upstream behaviour: full diagnostic prose as a separate message |

Flip it for the session with `/lens-compact-toggle`. `/lens-health` and the `lens-turn-summary` dock both report the current mode.

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
| --- | --- |
| `/lens-toggle` | Enable or disable the pipeline for this session |
| `/lens-context-toggle` | Keep tools/LSP/format on, stop injecting into the next turn |
| `/lens-compact-toggle` | Bounded summary on the tool result vs. the legacy verbose separate message |
| `/lens-widget-toggle` | Show or hide the composer status pill |
| `/lens-health` | Session health, LSP list, cascade, event-loop, noisy rules |
| `/lens-perf` | Process + machine-wide p50/p99 phase ranking |
| `/lens-tools` | Installer status grouped by source |
| `/lens-tdi` | Technical Debt Index |
| `/lens-map` | Write the HTML dependency map; the chip gets an Open map action |
| `/lens-allow-edit <path>` | One-shot read-guard exemption |

## WebUI

On the official dsh web profile the plugin ships a browser half (`dsh.client`):

- one pill in the composer usage row (`conversation.composer.dock`, `order: 2` — right after the cache-hit/usage pill, before the context meter)
- official primitives: `Menu`, chevron/search/check icons, CSS modules, zh/en locale

The pill reads the `lens` session projection, folded from widget-state on `tool/result`, `turn/end`, and `/lens-widget-toggle`. It shows the pi-lens tiers as compact counts (`2B 3E 5W`, plus `NLSP` for failed language servers) and a checkmark with `lens clean` once files were analyzed and came back clean; an unanalyzed session reads `idle` rather than claiming clean. Clicking it opens the per-file menu. It does **not** append a custom session event, so persistence will not reject the log.

The fold is scoped to the session's workspace root (`SessionHeader.cwd`), so each conversation lists only the files under its own workspace; the root stays host-side and the wire carries only the status snapshot.

### Two fixes worth knowing about

**The pill used to report an `LSP` count for servers that were alive and serving.** `snapshotLensStatus()` read `getFailedLspServerIds()` directly, but that returns *failed spawn records*, raw by design — a record is never replaced when a later spawn succeeds. Two staleness rules live in the sibling `selectLspStatus()`, which this fork now routes through instead.

**The WebUI used to show nothing at all, with a clean build.** Both slot entries imported `IconChevronDownOutline14` / `IconLinkOutline14`, which `@deepseek-ai/dsh-client-ui-primitives` does not export — React throws on an undefined element type, and `dsh-client-ui-slots` answers a render crash by silently *abdicating* the entry. The cause was `tsconfig.json` excluding `src/client/**`, so `tsc` never checked the browser half. `tsconfig.client.json` now typechecks it in `build`, `typecheck`, and `test`.

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
    compactInjection: true
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

## Development

```sh
npm install
npm run typecheck   # host + client programs
npm test            # builds, then runs the suite
npm run format      # biome, writes in place
```

`npm test` builds both TypeScript programs and runs `node --test` over `dist/test/*.test.js`.

## Host limits

dsh freezes tool arguments before dispatch, so Pi's in-flight edit autopatch cannot rewrite `old_string`. dsh already has its own read-before-edit observation policy.

These Pi host surfaces are not cloned: TUI footer, interactive LSP install prompts, session fork / cross-process nudge, official Settings cards (apiproxy allowlist), and `/lens-booboo` (still deferred upstream).

## Changes relative to upstream

Every behavioural difference is documented in **[CHANGELOG.md](CHANGELOG.md)**. The headline changes since the `NexusAgentX` fork point (`01bdc84`):

- **Compact injection** — diagnostics ride on the tool result, bounded at 200 chars, silent when clean.
- **WebUI rewritten** — header chip + input dock replaced by one `LensPill` in the composer usage row.
- **Browser half is typechecked** — `tsconfig.client.json` covers `src/client/**`.
- **Failed-LSP reporting fixed** — routed through pi-lens' own `selectLspStatus()`.
- **Per-workspace projection scoping** — one busy workspace can no longer starve another.
- **Dependencies pinned** to the versions the runtime actually ships.

## License

[MIT](LICENSE)

Inspired by [pi-lens](https://github.com/apmantza/pi-lens) (MIT). See [NOTICE](NOTICE).

---

## 中文

> **这是非官方的社区维护分支，由 [El1ver](https://github.com/El1mir) 维护。**
> 与上游 `NexusAgentX` 项目**无任何隶属、认可或发布关系**。
> 相对上游的全部改动记录在 [CHANGELOG.md](CHANGELOG.md)。

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的实时代码反馈插件。分析引擎还是 [pi-lens](https://github.com/apmantza/pi-lens)，这里是 dsh 宿主适配：写文件后跑 format / LSP / linter / 结构规则，并把结果反馈回模型。

当前版本：`dsh-lens@0.3.3`，兼容 DSH `>=0.2.0`。

### 这个分支为什么存在

上游把每一条诊断都**单独注入一条 user 消息**，而这条消息会被永久重放。旧路径把整个 `write`/`edit` 结果值（`{path, operation, before, after}`，**含新旧两份完整文件体**）序列化进 `event.content` 喂给 pi-lens，再把 pi-lens 返回的每个 block 注入对话——于是每次编辑都把文件的旧内容和新内容推进历史，且在后续每次请求里重放、永不回收。

六个大会话实测：`dsh-lens/notice` 占每次请求重放历史的 **65–69%**；最差单会话 298 条 notice、**7,583,170 字符**（超过所有真实工具结果之和）；而 20K 字符 notice 里真正有用的诊断中位数只有 **25–154 字符**——信噪比 **1:80 ~ 1:800**。

本分支换掉了这条通道：诊断现在**贴在工具结果里**。

### 安装

```sh
dsh plugin --profile web add dsh-lens
```

从本分支的 git 远程安装（**想要上述修复就用这个**，npm 包和上游仓库都不含这些修复）：

```sh
dsh plugin --profile web add github:El1mir/dsh-lens
```

本地源码构建安装（Windows）：`pwsh ./install-dsh.ps1`

不要和 `pi-lens-mcp` 同时挂同一批 workspace，会双开语言服务器。

### 注入行为

有 🔴 时，在 `write`/`edit` **自己结果**的尾部加一段 ≤200 字符的摘要：

```
🔴 src/foo.ts — 2 blockers: L42 unused import; L88 no-explicit-any
→ lens_diagnostics mode=all
```

- **干净时完全不注入**（`✓ <lang> clean · <n>ms` 不再进对话）。
- **`read`/`bash`/`grep`/`glob` 的结果一个字节都不动**，只有 `write`/`edit` 会带摘要。
- 摘要整体 **≤200 字符**（含提示行），最多列 3 条 blocker，每条消息 ≤60 字符。
- **静默 = 干净，但分析失败仍会上报**——pi-lens 管线崩溃会被显式写出，避免把"没有摘要"误读成"没有问题"。

两条防重复机制：同一文件的 blocker 集合没变则不再重报（`reportedSnapshots`，仅会话内存，且 key 含消息文本——所以"修好一个又引入一个"不会被误判为无变化）；而 `⚠️ auto-fixed N, file modified — re-read` 行**豁免**，它报的是磁盘状态变了。

turn-end findings（dead-code / call-graph / 测试结果）仍是独立消息（它们只在 turn 结束后才存在，无法挂在工具结果上），但每段压到首段 ≤200 字符；`lens-turn-summary` dock 豁免。

`compactInjection` 与 `contextInjection` **正交**：`contextInjection: false` 彻底不注入；`true` + `compactInjection: false` 回退上游旧行为。`/lens-compact-toggle` 可临时切换。

### WebUI

输入框下方的用量行里有一个 lens 小胶囊（紧跟缓存命中/用量胶囊，在上下文环之前），按 pi-lens 的层级显示 `2B 3E 5W` 这类计数加 `NLSP`，干净时显示对勾加 `lens clean`，还没分析过则显示 `idle` 而不是谎称干净。点开是分文件菜单。fold 按会话 workspace root（`SessionHeader.cwd`）作用域化，每个会话只列自己 workspace 下的文件。`/lens-widget-toggle` 可隐藏。

另有两处修复值得知道：胶囊曾为**仍然存活**的语言服务器报 `LSP` 计数（`getFailedLspServerIds()` 返回的是原始失败 spawn 记录，从不被后一次成功的 spawn 覆盖；现在改走 pi-lens 自己的 `selectLspStatus()`）；WebUI 曾**在干净构建下什么都不显示**（两个 slot entry import 了 primitives 包并不导出的 `IconChevronDownOutline14` / `IconLinkOutline14`，React 抛错后 slot 会静默让 entry 退场；根因是 `tsconfig.json` 排除了 `src/client/**`，现已由 `tsconfig.client.json` 覆盖）。

### 相对上游的改动

全部行为差异见 **[CHANGELOG.md](CHANGELOG.md)**。自 `NexusAgentX` 分叉点（`01bdc84`）以来的主要改动：紧凑注入、WebUI 重写为单个 `LensPill`、浏览器半边纳入类型检查、修复存活 LSP 的误报、投影按 workspace 作用域化、依赖版本钉死到运行时实际发布的版本。

配置继续用 `.pi-lens.json` / `~/.pi-lens/config.json`，也可以在 Cordis 条目里写 `lsp` / `format` / `guard` 等开关。
