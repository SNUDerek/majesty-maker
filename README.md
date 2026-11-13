# (Working Title) Medieval Princess Maker

A time-management "raising sim" proof of concept: schedule a weekly activity for your adoptive daughter (work, study, socialize, rest, or adventure) to prepare her for the final encounter.

## Requirements

- Node `^20.19.0 || >=22.12.0`

## Setup

```sh
npm install
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run sim` | Run the simulation CLI (`src/simulation/cli.ts`) |

## Simulation CLI

```sh
npm run sim -- --help
npm run sim -- --policy pragmatic --birth-sign aries --seed 123 --trace
npm run sim -- --all-policies --all-signs --runs 1000 --out reports/baseline
```

The campaign commands require E3's policy registry, which is not merged yet. Until E3 lands, policy selection exits with usage code 2; `--help` works now. Use `--config content/rules.experimental.json` for the experimental baseline and `--variant <name-or-path>` for additional overlays. `--trace-seed <seed>` replays a literal campaign seed from batch records; omit `--seed` and `--runs` when using it.

## Layout

- `src/core/`: pure rules engine. It must not import React, Zustand, Node built-ins, `fs` or `path`, or use `process` or ambient randomness/time (`Math.random`, `Date.now`, `new Date()`, `performance.now`, `crypto.*`). This is enforced by `src/tests/core-purity.test.ts`.
  - `src/core/index.ts`: public API for campaign creation, home and pilgrimage actions, available actions, calendar and derived stats. The reducer applies actions atomically, resolves collapse and convalescence, and enforces the deadline. Regular pilgrimages support encounters, checkpoints, retreat, return home, wipeout, and carrying one equipment item and one consumable. The final gauntlet unlocks at the last checkpoint, supports retries, and grants immediate victory even in the final week.
  - `src/core/pilgrimage.ts`: regular-segment and final-gauntlet state machine. Threats and checks use `rng.encounters`; Coin rewards use `rng.rewards`. Each segment entry spends one week and locks its lunar phase; encounters, retreat and banking spend no additional week, while wipeout convalescence is bounded by the deadline.
    - Consumables follow stage rules: Theriac and St. John's Wort between encounters or at waystations; Metheglin after a failed check, before its penalty. Equipment returns after wipeout; unused consumables are lost. Optional New Moon skipping is enabled by a non-null `astrology.newMoon.skipFee`, paid from carried Coin once per segment without a roll; it defaults off.
  - `src/core/rng.ts`: pure seeded RNG (Mulberry32) with named substreams (`jobs`, `encounters`, `rewards`) derived from the master seed by splitmix32. Every draw takes a state and returns `{ value, state }`.
  - `src/core/config.ts`: typed `RulesConfig`. `loadConfig({ rules, items, variants })` merges and validates parsed JSON, `hashConfig` gives a stable config id, and `getUnresolved` lists every non-confirmed parameter (see [docs/unresolved-parameters.md](docs/unresolved-parameters.md)).
  - `src/core/encounter.ts`: encounter matchups, probability breakdowns, roll-under checks, road bonuses, and failure penalties. Functions take config last and use the shared equipment hooks in `src/core/items.ts`. Regular segments use indices `0..regularSegments-1`; the final gauntlet uses index `regularSegments`.
- `src/simulation/`: headless batch simulation tooling.
  - `src/simulation/runner.ts`: `runCampaign({ seed, sign, policy, config, trace?, strict?, maxSteps? })` drives one campaign to victory or deadline, asking a `Policy` (`decide(state, available, derived, calendar)`) for each action. It returns `{ finalState, events, decisions }`, where each decision records its week, the pre-roll probability of any check it resolved, and its event range; `trace` adds before/after snapshots and `strict` runs the D1 invariant checker on every transition. `deriveBatchSeed(baseSeed, sign, runIndex)` gives policy-independent paired seeds.
  - `src/simulation/metrics.ts`: `runRecord(events, finalState, meta)` derives every tech §12 per-run field from the event stream (with `runMetaFromConfig` supplying calendar length, fee cap, matchup cycle and final ceilings via the public API). `aggregate(records)` groups by policy × sign, plus an `all` row per policy: Wilson 95% victory CI, victory-week and checkpoint distributions, wipeout causes, calendar utilization, matchup/approach rates, Coin flows by source, and deadline-versus-resource-loop attribution. Final-gauntlet progress includes survived failures and skips, excluding fatal or pending checks. Terminal settlements are included in the last spent week’s snapshot; empty treasury and empty total purse are reported separately. The resource-loop attribution uses a configurable closing window (default 24 weeks), so it is a reporting heuristic.
  - `src/simulation/cli.ts`: `npm run sim -- …` (tech §14). Selects policies (`--policy`/`--all-policies`, from the `POLICIES` registry in `policies.ts`, which E3 fills) and signs (`--birth-sign`/`--all-signs`); runs `--runs` campaigns each on paired seeds derived from `--seed`; loads `--config` over defaults (a full rules file or overlay, including `content/rules.experimental.json`), then `--variant` overlays (a name under `content/variants/` or a path) and the `--weeks` sensitivity override; `--strict` checks invariants. `--trace` prints a week-by-week log (date, moon and solar aspect, condition, then each action with its probability, roll and deltas; pilgrimage actions label their locked segment moon); `--trace-seed S` replays one campaign with literal seed S. It prints a policy × sign summary table; `--out <dir>` writes `runs.ndjson` and `aggregates.json` (E5 adds the report formats). Exit codes: 0 ok, 1 campaign error, 2 usage error.
- `src/tests/`: Vitest tests. Import `describe`/`it`/`expect` from `vitest` explicitly. Use `loadContentConfig()` from `src/tests/support/config.ts` to get the default config.
- `src/tests/scenarios/`: D2 deterministic rule and engine scenarios. Run with `npm test -- src/tests/scenarios`. Home scenarios activate when `src/core/index.ts` exists; C2–C4 owners must enable their `ENGINE_SUITES` flag in `harness.ts` when implementing the feature. Explicit flags prevent a regression from silently skipping an enabled suite. Pending engine scenarios are skipped until their dependencies land.
- `content/`: game data. `rules.default.json` holds the rules with every unconfirmed value flagged in its `provenance` map, `items.json` is the item catalog, and `rules.experimental.json` is the overlay used for simulation baselines (config-only balance changes go there).
- `docs/`: planning docs. Finished ones move to `docs/archive/`.
