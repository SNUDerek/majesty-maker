# E3 completed task specification

### E3 Policy bots
- **Interface:** `Policy = { id, params, decide(state, available, derived, calendar) → GameAction }`. Policies may only use observable state. Any thresholds come from params or the CLI.
- **E3a Stables-only baseline**: depends on E1. Work Stables; rest when a burden is within X of its ceiling.
- **E3b remaining families**: depends on C3, C4, E1. **The four families below can be built in parallel by different people:**
  1. **Greedy specialist (B/O/L variants):** trains and works its Estate, always approaches with its Estate, and departs and retreats on simple thresholds.
  2. **Balanced:** trains the weakest stat, works the best-odds job, picks the highest-probability approach, and rests near the ceilings.
  3. **Reckless pilgrim:** departs early with minimal carry and retreats only when the next failure would wipe it out.
  4. **Pragmatic pilgrim:** an expected-survival heuristic. It estimates P(survive remaining encounters) from the current probabilities and burdens, chooses carry ≥ k × 15, uses Waning for rest and Trine for jobs, and retreats below a survival threshold.
  - Each bot gets one smoke test: 20 seeds, no thrown errors, and a valid decision trace.

Implemented in `src/simulation/policies.ts` with seven registered policy IDs. See README for defaults, factory usage and survival-heuristic assumptions. Tests cover decisions, hidden-state access, items, route variants and 20 seeded strict/replay campaigns per policy.
