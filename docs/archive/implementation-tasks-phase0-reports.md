# E5 completed task specification

### E5 Report exports
- **Depends on:** E2, E4. **Parallel with:** E3b.
- **File:** `src/simulation/report.ts`.
- **Work:** write `runs.csv`, `summary.json` (with config hash, full config snapshot, unresolved-parameter list, git commit if available, and CLI args), `summary.md` (tables per policy × sign, flagged anomalies, and a "partial astrology" label when TBD astrology values are off), and `events.ndjson` for `--trace-seed` runs.
- **Acceptance:** a golden-file test on a 5-run batch with a fixed seed.

Implemented in `src/simulation/report.ts`, integrated into E4 `--out`. README documents the fixed CSV schema, nested JSON cells, summary metadata, diagnostic observations and tagged literal-seed events. The E4 raw files remain available for compatibility. A checked-in five-run seeded batch covers victories, a deadline, wipeouts and convalescence; separate event golden coverage verifies the selected debug stream. Policy stubs isolate report and CLI tests from unmerged E3 work.
