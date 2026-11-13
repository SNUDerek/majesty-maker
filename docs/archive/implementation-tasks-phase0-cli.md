# Phase 0 — E4 CLI

### E4 CLI
- **Depends on:** E1. **Parallel with:** E3, E5.
- **File:** `src/simulation/cli.ts`.
- **Work:** use `node:util` `parseArgs`. Flags: `--policy`, `--all-policies`, `--birth-sign`, `--all-signs`, `--runs`, `--seed`, `--trace`, `--trace-seed`, `--config`, `--variant`, `--out`, `--strict`, `--weeks` (sensitivity only). `--trace` prints a readable week-by-week log: activity, probability, roll, deltas, and aspects.
- **Acceptance:** the two commands in tech §14 work exactly as written.

Implementation reviewed in PR #24. The CLI tests exercise single-run traces and policy × sign batches with injected policies. Review fixes load full or partial `--config` files over defaults before variants, report invalid configuration as usage errors, and label pilgrimage actions with the locked segment moon and entry week. README documents commands and current integration status.

E3 integration (PR #25) populated the registry with factories that take the loaded config; the trace command is covered with real policies in `src/tests/policies.test.ts`, and the batch command was run manually with all seven policies. The batch command test uses two runs per policy × sign to keep it small. E5 owns the formal CSV/JSON/Markdown exports and trace NDJSON.
