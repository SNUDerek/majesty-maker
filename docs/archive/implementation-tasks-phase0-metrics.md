# Phase 0 — completed E2 metrics task

### E2 Metrics
- **Depends on:** T0.2 (event schema only). **Parallel with:** everything in A/B/C.
- **File:** `src/simulation/metrics.ts`.
- **Work:**
  - `runRecord(events, finalState, meta)`: every per-run field from tech §12, derived from events. There is no peeking into rules internals.
  - `aggregate(records)` by policy × sign: victory rate with a Wilson 95% CI, median victory week, checkpoint distribution, first-reach week per checkpoint, wipeout causes, calendar utilization fractions, approach frequency by matchup, Coin flows by source, and deadline-versus-resource-loop failure attribution.
- **Acceptance:** unit tests on synthetic event streams.

Completed and reviewed in PR #23. The implementation and synthetic-stream regression tests cover survived final-gauntlet failures, fatal and pending checks, rerolls, deadline settlements, and separate zero-treasury and zero-purse reporting.
