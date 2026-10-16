# Why the Lens WebUI showed nothing — diagnosis and plan

Date: 2026-10-02
Subject: `dsh-lens` 0.3.0 → 0.3.1 → 0.3.2
Scope: the WebUI (`lens` session projection) channel, the model (tools / prompt / hooks)
channel, and multi-workspace support.

## 1. Symptom

After activating the plugin in the `web` profile, the conversation header showed no Lens
chip and the input dock showed no Lens status line — in every session, with no error in
the browser console and no error in the DSH log. `lens_diagnostics` and the other
`lens_*` tools worked normally, and the plugin's system-prompt section was present in the
model request. The host half of the plugin was alive; the UI half was silently absent.

## 2. Root cause A — the projection was registered against an API version that no longer exists

`src/projection.ts` registered the `lens` session-projection unit with the field names of
`@deepseek-ai/dsh-session-projection@0.0.1-rc.1`:

```ts
projectionCtx.sessionProjections.register<"lens", LensStatus>({
  key: "lens",
  schema: lensSchema,     // old field name
  init: () => emptyLensStatus(state.flags, { mapPath: state.lastMapPath }),
  apply: (current, event) => { … },
  view: (value) => value, // old placement: top level, not inside `wire`
  stateVersion: 2,
});
```

The runtime in use is `0.2.0-rc.2`, whose `ProjectionDefinition` differs:

| concept | 0.0.1-rc.1 | 0.2.0-rc.2 (live) |
| --- | --- | --- |
| fold-state schema | `schema: ZodType<SessionProjectionMap[K]>` | `stateSchema: ZodType<S>` |
| client view | top-level `view(state)` | `wire?: { viewSchema: ZodType<…>; view(state) }` |

`dsh-session-projection/lib/index.js:68-80` reads the stored definition as

```js
const wire = definition.wire;
const erased = {
  key: definition.key,
  stateSchema: definition.stateSchema,
  init: …,
  apply: …,
  wire: wire === void 0 ? void 0 : { viewSchema: wire.viewSchema, view: (state) => wire.view(state) },
  stateVersion: definition.stateVersion,
};
```

JavaScript does not validate those names, and the runtime only guards `stateVersion`
(`index.js:81` throws unless it is a non-negative safe integer). Registration therefore
**succeeded silently** — but with `definition.wire === undefined` the unit is classified as
**host-only**, and every publication path skips host-only units (`index.js:147`, `:170`,
`:249`, `:305`, `:340`, `:415-416` all test `def.wire === void 0` / `wire !== void 0`).

Consequence chain:

1. `lens` never enters the projection snapshot pushed to the client.
2. `useProjection("lens")` returns `undefined` —
   `dsh-api-session-controller/lib/types/client/sessions/projection-store.d.ts:22-31`
   documents that value as the uniform "capability absent" result: *"host unit unmounted,
   or no baseline/frame has carried the key yet"*.
3. `src/client/status-view.ts` `readLensStatus()` rejects `undefined`.
4. `src/client/LensChip.tsx` does `if (!status || !status.visible) return null`, and
   `src/client/LensDock.tsx:26-28` does
   `if (!status || !status.visible || !status.enabled) return null`.
5. Both slot registrations mount and render nothing. The slot names themselves are real:
   `conversation.session.header.actions` at
   `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:155-159` and
   `conversation.input.dock` at `:214-218`.

A second, latent symptom: `index.js:255` and `:297` call `def.stateSchema.parse(row.val)`
when a persisted checkpoint row is usable, so with `stateSchema === undefined` the first
successful persistence of a `lens` row would have thrown
`TypeError: Cannot read properties of undefined (reading 'parse')`.

## 3. Root cause B — the session bootstrap hook subscribed to an event that does not exist

`src/hooks.ts:143` subscribed to `"agent/session-start"`. That name is not in the `Events`
surface at all. The complete agent lifecycle surface in
`dsh-agent/lib/types/runtime-types.d.ts` is `agent/created` (:227), `agent/disposed`
(:240), `agent/status` (:252), `agent/inbox/inserted` (:263), `agent/inbox/claimed` (:277),
`agent/inbox/discarded` (:289), `agent/pre-step` (:304), `agent/request` (:327),
`agent/request-error` (:348), `agent/assistant-stream` (:366), `agent/turn-stopping` (:387)
and `agent/error` (:402). `dsh-session` offers only `session/created`
(`dsh-session/lib/types/index.d.ts:42`), which yields a bare `Session` rather than the
`agent` the handler needs.

`ctx.on()` accepted the unknown name at runtime, so nothing failed loudly; the bootstrap
simply never ran — no `analyzeWorkspace()` on a new session, and no
`consumeSessionStartGuidance()` injection.

## 4. Why the repo's own typecheck did not catch either bug

`npx tsc -p tsconfig.json --noEmit` exited **0** before the dependency alignment. The
repo's `node_modules/@deepseek-ai/*` tree had been resolved earlier and was stuck at
`0.0.1-rc.x` while the runtime ships `0.2.0-rc.2` for every package:

| package | repo (before) | live runtime |
| --- | --- | --- |
| `@deepseek-ai/dsh-session-projection` | 0.0.1-rc.1 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-agent` | 0.0.1-rc.5 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-tools` | 0.0.1-rc.1 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-llm` | 0.0.1-rc.5 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-session` | 0.0.1-rc.5 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-commands` | 0.0.1-rc.1 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-skill` | 0.0.1-rc.1 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-system-prompt` | 0.0.1-rc.5 | 0.2.0-rc.2 |
| `@deepseek-ai/dsh-client-ui-primitives` | 0.0.1-rc.1 | 0.2.0-rc.2 |
| `@deepseek-ai/cordis` | 4.0.1 | 4.0.4 |
| `@deepseek-ai/schemastery` | 3.18.1 | 3.18.4 |

…while `package.json` declared the *correct* ranges
(`"@deepseek-ai/dsh-session-projection": ">=0.2.0-0"` as a peer at `:93` and a devDependency
at `:125`). `tsc` type-checked the source against the stale 0.0.1 declarations, which
describe exactly the API the source was written for — so the source checked clean against a
runtime that no longer existed.

Pinning the devDependencies to `0.2.0-rc.2` (cordis `4.0.4`, schemastery `3.18.4`) reduced
the whole drift to three errors, which is what identified both bugs.

## 5. Fixes applied in 0.3.1

| file | change |
| --- | --- |
| `src/projection.ts:62` | `schema:` → `stateSchema:` |
| `src/projection.ts:74-77` | view nested as `wire: { viewSchema: lensSchema, view: (value) => value }` |
| `src/types.ts:45-53` | added `SessionProjectionStateMap { lens: LensStatus }` next to the existing `SessionProjectionMap { lens }` |
| `src/hooks.ts:147` | `"agent/session-start"` → `"agent/created"` |
| `src/hooks.ts:150` | handler reshaped to the declared `undefined \| Promise<undefined>` return contract |
| `package.json` (devDependencies) | every `@deepseek-ai/*` pinned to the version the runtime actually ships |
| `package.json` version | 0.3.0 → 0.3.1 |
| `src/test/projection.test.ts` (new) | regression guard: captures the registered definition through a stubbed `ctx.inject` and asserts `stateSchema` and `wire` exist while the old `schema` key does not; also asserts `src/hooks.ts` binds `ctx.on("agent/created")` and never `agent/session-start` |

Why both maps are needed: the runtime keeps them separate
(`dsh-session-projection/lib/types/types.d.ts:19-23`) — *"Each client-visible key also
appears in `SessionProjectionMap`; host-only keys appear only here."* The client-visible
`register()` overload (`lib/types/index.d.ts:150-152`) constrains the state type through
`SessionProjectionStateMap` and simultaneously requires a non-optional `wire`.

## 6. Verification performed

- `npx tsc -p tsconfig.json --noEmit` → exit 0 (was three errors).
- `npm test` → 41 passing, 0 failing (30 before the 0.3.2 workspace-scoping tests).
- The live publication step itself is now covered. `@deepseek-ai/dsh-session-projection`
  `lib/index.js` publishes with `viewCell()` → `wire.viewSchema.parse(wire.view(cell.state))`;
  `src/test/projection.test.ts` replays that exact expression on the definition dsh-lens
  registers, and asserts the result is a client `LensStatus` (boolean `visible` / `enabled`,
  array `files`) carrying **no** `root` — and that handing the same schema the fold wrapper
  fails validation instead of silently shipping.
- Repacked and installed into the `web` profile:
  `.install/20261002-195049-6094732/dsh-lens-0.3.1.tgz`. The profile entry
  (`C:\Users\Administrator\.dsh\profiles\web\package.json`) now points at it and the
  installed package reports `0.3.1`.
- SHA-256 of `dist/client.js`, `dist/client.body.cjs`, `dist/projection.js`,
  `dist/hooks.js` and `dist/index.js` in the repo build equals the copy installed at
  `C:\Users\Administrator\.dsh\profiles\web\node_modules\dsh-lens\dist`.
- Repacked and installed 0.3.2 (the workspace-scoping release) into the same profile:
  `.install/20261002-195656-2903167/dsh-lens-0.3.2.tgz`. The installed package reports
  `0.3.2`, `dist/workspaces.js` ships, and `dist/projection.js` contains
  `stateSchema: lensFoldSchema`, `rootFromHeader(header)` and `stateVersion: 3`. SHA-256 of
  `projection.js`, `hooks.js`, `index.js`, `client.js`, `client.body.cjs` and
  `workspaces.js` equals the repo build; `client.js` is still the same 18,117 bytes as in
  0.3.0 — the client half needed no change, because `wire.view` keeps handing it the same
  `LensStatus` shape.
- **Not yet verified end-to-end.** The running DSH web server (PID 31068) still holds the
  0.3.0 module graph in memory, so a restart of the `web` profile plus a browser refresh is
  required before the chip can appear. The client bundle was never the problem and is
  byte-identical to the previously installed one.

## 7. The model channel — working, confirmed live

The `lens_*` tools, the system-prompt section (`src/prompt.ts:14-21`) and the
`tools/pre-execute` / `tools/post-execute` blockers are delivered through DSH's own tool and
prompt contracts; they do not depend on the projection. Their delivery is confirmed in a
live session: after a failed file mutation, the next turn carried a
`🔴 STOP — 2 issue(s) must be fixed` block naming the file, line, rule and message. That is
the blocker tier of the w/e display arriving in the model request — the second half of what
this plugin is for.

## 8. Multi-workspace

**Implemented in 0.3.2 — option 3 (per-session filtering) on a single engine.** The engine stays
one runtime (one pool of language servers, one cache), but the `lens` projection now folds a
*root-scoped* snapshot. `ProjectionDefinition.init(header)` receives the `SessionHeader`, whose
`cwd?: string` is the same immutable value `sessionCwd()` uses to drive `analyzeWorkspace`, and
`src/workspaces.ts:rootFromHeader()` carries it into the fold state as
`LensFoldState { root, status }`. `apply()` re-scopes every refresh to `current.root`, and
`wire.view` publishes only `value.status`, so the root never crosses the wire.
`rankWorkspaceFiles()` filters by `root` **before** the `MAX_FILES = 8` cap in `src/status.ts`,
so a busy second workspace can no longer starve the first. When a header carries no cwd the
filter is a no-op and the view degrades to the previous global behaviour.

Why the filter is sufficient (verified): the engine's `clearWidgetState()`
(`pi-lens/dist/clients/widget-state.js:65-71`, `files.clear()` + `lspServers.clear()`) is only
reached from pi-lens's **own** `session_start` extension handler
(`pi-lens/dist/index.js:78721` fork / `:78739` new / `:78744` maybe-rehydrate). The client entry
dsh-lens actually calls — `pi-lens/dist/clients/runtime-session.js`, exported as
`handleSessionStart` — never calls it, and dsh-lens passes neither `sessionReason` nor a
`sessionId`, so the rehydrate branch is not on this code path either. A workspace switch
therefore does **not** wipe the previous workspace's records: file entries from every analysed
workspace accumulate in the single widget store, which is exactly what makes per-root
filtering able to hand each conversation its own list.

Today there is exactly one `LensRuntime` per host process. `createRuntime()`
(`src/runtime.ts`) builds it once; `analyzeWorkspace(state, cwd)` re-points
`state.projectRoot` / `state.sessionCwd` and restarts the session whenever the cwd changes,
so N open workspaces share one runtime on a "latest workspace wins" basis.
`snapshotLensStatus()` (`src/status.ts`) then reads the pi-lens engine's **process-global**
widget state (`exportWidgetState()`, `getLSPService().getStatus()`, `getSessionLanguages()`,
`getFailedLspServerIds()`), and `state.flags` is global too.

The three-tier rendering itself already exists and is workspace-agnostic: `isBlocking()`
in `src/status.ts` (blocking → error → warning) and `fileLabel` in `src/client/counts.ts`
renders `"<b>B <e>E <w>W"`, with `statusDot` / `fileDot` mapping to `error` / `warning` /
`done`. Only the *data delivery* is per-workspace-blind.

Design options for per-workspace isolation:

1. **One engine runtime per workspace root** (`Map<normalizedRoot, LensRuntime>`), keyed off
   `sessionCwd(agent)`. Cleanest semantically, but each runtime starts its own LSP servers,
   and the engine's widget state is a module-level global — the second workspace's analysis
   overwrites the first's counters. Requires either upstream pi-lens support for multiple
   widget-state instances, or a per-workspace snapshot captured immediately after that
   workspace's analysis pass.
2. **Single runtime, per-workspace cached snapshots.** Keep one engine runtime (one set of
   LSP servers), but after each `analyzeWorkspace(root)` capture `snapshotLensStatus()` into
   a `Map<root, LensStatus>` and serve the projection from the entry matching the session's
   cwd. Cheap, no upstream work, but a workspace's numbers are only as fresh as its last
   analysis pass, and two workspaces cannot be scanned concurrently.
3. **Per-session projection filtering only.** Keep the global snapshot but publish only the
   files belonging to the session's workspace (`LensStatus.files` filtered by root prefix) —
   the smallest change that makes each conversation show its own workspace's problems, at the
   cost of still sharing one engine and one LSP pool.

**Chosen: option 3, per-session projection filtering, on the single engine.** It is the
smallest change that makes each conversation show its own workspace's problems, and it cannot
multiply language servers — the expensive and contention-prone resource. Option 2
(per-workspace cached snapshots) is the next step if a session needs numbers fresher than its
own last analysis pass; option 1 remains the target if pi-lens ever exposes per-root widget
state.

A second multi-workspace gap: analysis of workspace A keeps feeding the shared engine cache
while workspace B is active. If concurrent workspaces must be scanned in parallel rather than
lazily on their own tool calls, the engine needs a per-root serialization queue; today
`analyzeWorkspace` effectively serializes everything through one runtime coordinator.

A third gap, read off the source rather than suspected: `analyzeWorkspace()` (`src/runtime.ts:64-77`)
skips the restart only when the target root is already **both** `state.projectRoot` and the single
shared `state.sessionCwd`. With two conversations interleaving tool calls in two workspaces, every
call re-enters the `else` branch and re-runs `startSession()` →
`handleSessionStart({ startupModeOverride: "full" })` (`src/runtime.ts:84-121`) — a full re-analysis
per switch, back and forth. That is a throughput cost, not a display bug: the widget store keeps both
workspaces' records either way, so per-root filtering stays correct. It is deliberately left unchanged
in 0.3.2 because the trigger lives on the model-side channel (`src/hooks.ts`, `tools/pre-execute`),
which currently works and can only be judged against a live session — after the restart. A conservative
fix would be a `Set<string>` of already-bootstrapped roots: re-point `state.projectRoot` /
`state.sessionCwd` on a return visit and skip the full bootstrap, since the engine's per-root caches
and widget records survive the switch.

## 9. What to check after the restart

1. The header chip appears in the conversation (it renders only when `visible && enabled`;
   `createRuntime()` defaults `widgetVisible: true`).
2. `fileLabel` shows the three tiers as `B/E/W` counts, and the chip dot follows
   `blocking|errors → error`, `warnings|failedLsp → warning`, else `done`.
3. With two workspaces open in different conversations, each conversation lists only the files
   under its own workspace root (`SessionHeader.cwd`). A session whose header carries no cwd
   falls back to the unscoped global list, which is intended, not a regression.

## 摘要（中文）

- UI 什么都不显示的直接原因：`src/projection.ts` 用旧版 API 注册 `lens` 投影（`schema` 字段 + 顶层 `view`），缺少新版强制要求的 `wire`。运行时因此把该单元判定为「仅宿主」，永远不推送给客户端，`useProjection('lens')` 恒为 `undefined`，`LensChip` / `LensDock` 都 `return null`。
- 第二个 bug：`src/hooks.ts:143` 订阅的 `agent/session-start` 事件根本不存在（真实事件是 `agent/created`），所以新会话的首次工作区分析从未执行。
- 为什么一直没被发现：仓库 `node_modules` 里的 `@deepseek-ai/*` 全是 `0.0.1-rc.x`，而运行时是 `0.2.0-rc.2`。`tsc` 拿旧声明检查为旧 API 写的代码，退出码 0，完全掩盖了漂移。把 devDependencies 钉到实际版本后，整个漂移只剩 3 个错误，两个 bug 立刻暴露。
- 已修复并打成 0.3.1 安装进 `web` profile（`.install/20261002-195049-6094732/dsh-lens-0.3.1.tgz`）：类型检查 0 错误、测试 30/30 通过、安装产物哈希与本地构建一致。
- **还需要重启 `web` profile 并刷新浏览器**，运行中的进程仍持有 0.3.0 的模块图。
- 模型通道本来就是好的：本会话中已经实际收到 `🔴 STOP — 2 issue(s) must be fixed` 注入，证明阻断项能进入下一轮请求。
- 多工作区已在 0.3.2 实现（§8）：保持单引擎，但 `lens` 投影改为折叠「按工作区根限定」的快照 —— `init(header)` 从 `SessionHeader.cwd` 取根，`apply()` 按该根重新过滤，`wire.view` 只发布 `status`（根不下发）。过滤发生在 `MAX_FILES = 8` 截断之前，避免一个繁忙的工作区挤掉另一个；header 无 cwd 时退化为全局视图。
- 已修复并打成 0.3.2（测试 41/41 通过；新增用例直接复刻运行时的发布步骤 `viewCell()` = `wire.viewSchema.parse(wire.view(state))`，断言发布结果就是客户端 `LensStatus`，且 `root` 不下发）。
