# E5 report exports

Implement `src/simulation/report.ts` against merged E2 metrics and E4 CLI, without depending on unmerged E3 bots.

1. Render deterministic `runs.csv`, `summary.json`, and `summary.md` from per-run records. Include the full effective config, hash, unresolved parameters, CLI args, policy params, optional Git commit, policy × sign aggregates and explicit diagnostic flags. Label disabled TBD astrology effects as partial astrology. Preserve complete nested metrics as JSON-valued CSV cells, with fixed stats/ceilings/week/cause fields flattened for spreadsheet use.
2. Integrate with CLI `--out`; retain E4 raw files for compatibility. Export tagged `events.ndjson` only for literal `--trace-seed` campaigns. Avoid retaining ordinary batch event streams. Remove a stale trace export when reusing an output directory for an untraced report.
3. Add checked-in golden files for a fixed five-run seeded batch, separate trace-event golden coverage and regression tests for quoting, metadata, missing Git, disabled/full astrology, anomalies, multiple policies/signs, directory reuse and CLI errors.
4. Run full tests/typecheck, document report formats and limitations, archive completed task/plan, commit and open a PR. Keep branch/worktree for review.

Flags describe observed conditions (resource loops, empty treasury, fee shortfalls, collapses, failed departures, unfinished runs); they do not assert a balance defect. No rules, balance changes, new CLI flags or E3 integration belong to E5.
