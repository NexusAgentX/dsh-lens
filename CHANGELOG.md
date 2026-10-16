# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Diagnostics now ride on the tool result instead of being injected as a separate user message.** The old path serialized the whole `write`/`edit` result value — `{path, operation, before, after}` with both full file bodies — fed that to pi-lens as `event.content`, and then injected every block pi-lens returned, which meant the file's old and new contents were replayed into the conversation once per edit and never reclaimed. Measured across six large sessions, `dsh-lens/notice` accounted for 65–69% of every request's replayed history (one session: 298 notices, 7,583,170 chars, more than all real tool results combined), and the useful diagnostic inside a 20K-char notice had a median of 25–154 chars — a signal-to-noise ratio between 1:80 and 1:800. The compact path hands pi-lens the tool result's rendered content (~122 chars for `write`) instead, takes only the blocks pi-lens *appends* (`texts.slice(eventContent.length)`), reads the current blocking set from pi-lens' widget state, and attaches a bounded summary to `decision.content` — the tool result itself. The `✓ <lang> clean · <n>ms` all-clear line is no longer injected at all: a clean edit is silent.
- `tools/post-execute` is now registered with `{prepend: true}`, putting dsh-lens at the outer edge of the waterfall. It must append to the *final* `downstream.content` (after spill-policy and sol-pi have run), and its ~200-char addition must not be handed back to spill-policy as fresh inline output.
- Turn-end findings (`agent/turn-stopping`) stay a separate message — dead-code, call-graph impact and test results only exist once the turn is over and cannot ride on a tool result — but each block is now capped to its first paragraph (`capFindings`, ≤200 chars). The opt-in `lens-turn-summary` dock is exempt: it is a status panel, not a finding.

### Added

- `src/summary.ts` — the pure summary layer: `buildCompactAttachment`, `buildBlockerLine`, `buildWarnLine`, `blockerSnapshot`, `capFindings`, `parseAutofixCount`, `hasFileModifiedNotice`, `pipelineErrorFrom`, `toDisplayPath`, and the `PULL_HINT` / `MAX_ATTACHMENT_CHARS` (200) / `MAX_LISTED_BLOCKERS` (3) budgets. No I/O, so it is directly unit-testable.
- `src/test/summary.test.ts` — fourteen tests over the summary shape: silence on a clean edit, singular/plural, the three-entry cap with `+N more`, entry-dropping under a tight budget, the warn line's `— re-read` being tied to `file modified` rather than to the autofix count, a failed analysis reporting instead of staying silent, and snapshot keys that notice a fix-one-introduce-another regression.
- `compactInjection` config flag (**default on**) plus `/lens-compact-toggle` for a session-only flip. It is orthogonal to `contextInjection`: `contextInjection: false` silences the wrapper entirely, while `contextInjection: true, compactInjection: false` restores the legacy verbose behaviour. `/lens-health` and the `lens-turn-summary` dock now both report the mode.
- Per-file blocker snapshots (`LensRuntime.reportedSnapshots`, session memory only) so an unchanged blocker set is not re-attached to every subsequent edit of the same file. The `⚠️ auto-fixed` / `file modified` line is deliberately exempt — it reports a new disk state, not a known problem.
- `getFileDiagnostics` to the `pi-lens/dist/clients/widget-state.js` module shim. It is a real export of that module; the declaration was simply missing, which is why the compact path could not read current blockers.
- `src/test/injection.test.ts` — nine tests driving the compact path against pi-lens' real widget-state store, one per acceptance criterion: a clean edit injects nothing, a file with 🔴 blockers gets a ≤200-char summary appended to the tool result's own content, an unchanged blocker set is not re-reported while a changed one is, and `read` / `bash` results come back byte-for-byte unchanged. Plus the three refusal paths (blocked decision, `value`-replacing decision, failed tool call) and the auto-fix line surviving with no blockers at all.
- `src/test/lsp-status.test.ts` — seven tests locking the failure-selection policy: alive-sibling suppression, in-use gating, auxiliary scanners never surfacing as language failures, and unknown ids being dropped. The session-kind vocabulary is pi-lens' coarse `jsts`/`python` grouping, not server ids.

### Fixed

- **The pill reported an `LSP` count for language servers that were alive and serving.** `snapshotLensStatus()` read `getFailedLspServerIds()` directly, but that function returns *failed spawn records* — raw, by its own design. Its doc comment says the two staleness rules live in the sibling `selectLspStatus`: drop a failure when an alive language server already covers the same extensions, and drop one whose language is no longer in use this session. A record is never replaced when a later spawn succeeds, and pi-lens deliberately files a cold-launch diagnostics timeout under `failureKind: "success"`, so the raw list stays non-empty for a demonstrably healthy session. `src/status.ts` now routes the list through `selectLspStatus()` (with `getAliveServerIds()` and `getSessionLanguages()`), falling back to the raw list if the upstream call is unavailable.
- `[dsh-lens] Active tools: …` flooded the DSH log once per workspace switch. pi-lens routes that line through the `log` dependency and re-emits it on every `handleSessionStart`, so `log` is now demoted to `logger.debug` (the dependency is used for nothing else). The `session started for …` line is deduplicated per normalized root via the new `LensRuntime.announcedRoots`, so returning to a workspace logs `session re-started for …` at debug instead of repeating the announcement at info.
- Removed `src/client/css-modules.d.ts`, a duplicate of `src/css-modules.d.ts`, which produced `typescript:2300 Duplicate identifier 'classes'` — the `1B` the pill was reporting.
- `src/upstream-modules.d.ts` declared a stale `getLSPService()` face without `getAliveServerIds()`, and had no declaration for `pi-lens/dist/clients/lsp-status.js` at all.

## [0.3.3] - 2026-10-03

### Fixed

- **The WebUI never showed anything because both slot entries crashed while rendering.** `src/client/LensChip.tsx`, `src/client/LensDock.tsx`, and `src/client/menu-items.tsx` imported `IconChevronDownOutline14` / `IconLinkOutline14` from `@deepseek-ai/dsh-client-ui-primitives`. That package exports `IconChevronDownOutlineMedium` / `IconChevronDownOutlineRegular` and has no `...14` variant, so the import evaluated to `undefined`. React throws on an undefined element type, and `@deepseek-ai/dsh-client-ui-slots` answers an entry-boundary render crash by *abdicating* the entry: the registration stays, the entry silently retires, and nothing is drawn — with a clean build. Confirmed live: `dsh-lens/dsh-lens` was the only `active: false` occupant of both `conversation.session.header.actions` (order 25) and `conversation.input.dock` (order 5), while every sibling plugin's entry was `active: true`.
- `tsconfig.json` excludes `src/client/**`, so `tsc` never typechecked the browser half and the missing export could not fail the build. Added `tsconfig.client.json` (`noEmit`, `jsx: react-jsx`, DOM lib, `types: ["react"]`) and wired it into `build` and `typecheck`, so `test` runs it too. It reproduces the exact shipped error: `TS2724: '"@deepseek-ai/dsh-client-ui-primitives"' has no exported member named 'IconChevronDownOutline14'`.
- `openPath()` in `src/client/counts.ts` now validates its target: `window.open` refuses any path carrying a URL scheme (`javascript:`, `data:`, `https:`).

### Changed

- **The status UI moved into the composer usage row.** `LensChip` (header actions) and `LensDock` (input dock) are replaced by `src/client/LensPill.tsx`, registered into `conversation.composer.dock` at `order: 2` — immediately after the cache-hit/usage pill (`mf/stats`, order 0) and before the context meter, which `InputBar` renders after the dock. The pill mirrors `ui-chat`'s `StatsPills.module.css` so it reads as a peer of the usage pills.
- The pill shows the pi-lens tiers as compact counts — `2B 3E 5W`, plus `NLSP` for failed language servers — and a checkmark with `lens clean` once files were analyzed and came back clean. An unanalyzed session stays `idle` rather than claiming clean, because the startup heavy scans (knip, jscpd) persist into the cache manager rather than the widget store.

### Added

- `src/lens-display.ts` — framework-free `lensPillState()` tier logic, deliberately outside `src/client/**` so the host test suite can cover it (that directory is excluded from `tsconfig.json`).
- `src/lens-status.ts` — the augmentation-free wire shapes, split out of `src/types.ts` so the browser half typechecks without pulling host-only projection machinery into its program.
- `src/test/lens-display.test.ts` — seven tests covering idle vs clean, tier order, zero-tier omission, and failed-LSP surfacing.
- Two `src/test/package.test.ts` guards: the client registers only into `conversation.composer.dock`, and the built bundle contains no `Outline14` identifier.

## [0.3.2] - 2026-10-02

### Added

- Per-workspace scoping of the `lens` session projection. `src/workspaces.ts` derives the workspace root from the session header's `cwd`, the fold state becomes `LensFoldState { root, status }`, and `wire.view` publishes only the status snapshot. `snapshotLensStatus()` filters by root **before** the `MAX_FILES = 8` cap, so one busy workspace can no longer starve another. A header without a cwd leaves the filter off, keeping the previous global behaviour.
- `src/test/workspaces.test.ts` — pure tests for root normalization, sibling-prefix rejection, header parsing, and newest-first-then-scoped ranking.

### Changed

- `src/test/projection.test.ts` — the capture harness now asserts the fold survives `stateSchema` with its `root` intact, that the wire view unwraps `.status`, and that `init()` / `apply()` scope from the header and the fold respectively.

## [0.3.1] - 2026-10-02

### Fixed

- Register the WebUI `lens` session projection with the live API: `stateSchema` (not `schema`) plus the mandatory `wire: { viewSchema, view }`. The 0.3.0 literal omitted `wire`, so `@deepseek-ai/dsh-session-projection` classified the unit as host-only and never published it — `useProjection('lens')` stayed `undefined` and the Lens chip and dock rendered nothing in every session.
- Declare `lens` in `SessionProjectionStateMap` as well as `SessionProjectionMap`, so the client-visible `register()` overload can constrain the fold state.
- Bind the session bootstrap hook to `agent/created`. The previous event name `agent/session-start` does not exist in the `Events` surface, so workspace analysis and session-start guidance injection never ran on a new session.
- Pin every `@deepseek-ai/*` devDependency to the version the runtime actually ships (`0.2.0-rc.2`, cordis `4.0.4`, schemastery `3.18.4`). The stale `0.0.1-rc.x` tree in `node_modules` hid every one of these drifts from `tsc`.

### Added

- `src/test/projection.test.ts` — regression guard asserting the registered projection carries `stateSchema` and `wire`, and that the session bootstrap hook targets a real agent lifecycle event.

## [0.2.5] - 2026-08-14

### Fixed

- Forward `{ cwd, signal }` as the fifth pi-lens tool argument. Without it, `lens_diagnostics` / `lsp_diagnostics` / `module_report` crashed on `ctx.cwd` / `ctx.signal`.
- Prefer the session workspace over `process.cwd()` so `symbol_search` does not treat the web service home directory as the project root.

## [0.2.4] - 2026-08-14

### Fixed

- Client plugin injects `locale` before registering dictionaries. `if (ctx.locale)` still reads the service and crashed the Web overlay with `cannot get property "locale" without inject`.

## [0.2.3] - 2026-08-14

### Fixed

- Register tools with a real JSON Schema output (`text` + unconstrained `details`) instead of `{ type: 'json' }`, which `tools.register` rejects.
- Normalize pi-lens parameter schemas onto the dsh subset (`anyOf` → `oneOf`, drop `minItems`/`maxItems`/empty `enum`).

## [0.2.2] - 2026-08-14

### Fixed

- Re-export `inject` from the package entry so Cordis can see `ctx.tools` when the plugin loads.
- Register `/lens-*` commands, the system-prompt section, and bundled skills with `ctx.inject` instead of `ctx.get` without inject.

## [0.2.1] - 2026-08-14

### Changed

- README now documents WebUI primitives, the full flag table, skills, and host limits.

## [0.2.0] - 2026-08-14

### Added

- WebUI diagnostics chip and dock via the official `lens` session projection.
- Search-card presentation for diagnostics / ast-grep / symbol search.
- `/lens-widget-toggle` now shows or hides the WebUI widget.
- `/lens-health`, `/lens-perf`, and `/lens-tools` now match the pi-lens reports (p50/p99, LSP list, installer sources).
- Plugin config exposes the full pi-lens flag set (`lsp`, `format`, `guard`, …).
- `dsh-lens build-graph` delegates to the upstream review-graph CLI.
- Widget snapshot includes live LSP status and the last `/lens-map` path.
- Restyled the WebUI chip/dock to official Jobs/Plan primitives: Menu, Tooltip, StateDot, locale, CSS modules.

## [0.1.0] - 2026-08-14

### Added

- Host-native DeepSeek Harness adapter around the pi-lens engine.
- On-write pipeline via `tools/pre-execute` and `tools/post-execute`.
- Turn-end / session-start / agent-idle lifecycle hooks.
- Full agent tool surface and `/lens-*` commands.
- Bundled pi-lens skills and a system-prompt section.

## [0.0.1] - 2026-08-14

### Added

- Reserved the `dsh-lens` npm name.
- Shipped an installable DeepSeek Harness bundle stub (`dsh.bundle`).
