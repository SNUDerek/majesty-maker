# E3 policy bots

Implement E3a and E3b in `src/simulation/policies.ts`, using the existing E1 Policy contract. Export a factory and seven stable policy IDs for E4. Keep all strategy thresholds in validated, recorded params. Capture rules config for production odds/penalty helpers; never inspect seed/RNG, hidden draws, or future rolls.

1. Add the Stables-only baseline and shared deterministic home/road selection.
2. Add B/O/L specialists, Balanced, Reckless and Pragmatic. Use engine odds with segment-locked lunar phases. Pragmatic estimates segment survival with a binomial failure budget: average best-approach odds over configured threat weights and the smallest failure capacity among resources those approaches spend. This is a conservative heuristic, not a prediction of the hidden deck. Carry targets scale with configured failure penalty (baseline 15).
3. Test decision boundaries, observation-only behavior, deterministic replay, configurable route/item support, and 20 seeded strict campaigns per policy with trace replay.
4. Run the full suite and typecheck, document usage/params, mark E3 complete, and open a PR. Keep branch/worktree for review.

Defaults are experimental strategy choices, not balance conclusions. No core rules or CLI implementation changes belong to E3.
