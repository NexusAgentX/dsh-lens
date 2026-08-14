# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
