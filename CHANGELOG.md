# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-14

### Added

- WebUI diagnostics chip and dock via the official `lens` session projection.
- Search-card presentation for diagnostics / ast-grep / symbol search.
- `/lens-widget-toggle` now shows or hides the WebUI widget.
- `/lens-health`, `/lens-perf`, and `/lens-tools` now match the pi-lens reports (p50/p99, LSP list, installer sources).
- Plugin config exposes the full pi-lens flag set (`lsp`, `format`, `guard`, …).
- `dsh-lens build-graph` delegates to the upstream review-graph CLI.
- Widget snapshot includes live LSP status and the last `/lens-map` path.
- Restyled the WebUI chip/dock to the official Jobs primitives (StateDot, chevron, CSS modules, hover/focus).

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
