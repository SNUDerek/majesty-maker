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

Policy IDs are the seven E3 bots (see [Policy bots](#policy-bots-e3)). Use `--config content/rules.experimental.json` for the experimental baseline and `--variant <name-or-path>` for additional overlays. `--trace-seed <seed>` replays a literal campaign seed from batch records; omit `--seed` and `--runs` when using it.

### Open-question decisions candidate

The rules settled in [docs/open-questions-tasks.md](docs/open-questions-tasks.md) are implemented in the engine. The shipped defaults keep the **legacy control** values, so rule changes can be compared on the same executable. The selected values are in the `open-questions-decisions` variant: tutor burdens 5/0, 0/5, 3/2; Square doubling both tutor burdens; Purse Protection on failed Laboratores encounters; Waxing ×1.20; New/Full Moon home bonuses +20%; 10-Coin New Moon skip; retreat toll 10; wipeout recovery −35/−35; and a 20-Coin home-collapse physician fee.

```sh
# Candidate and legacy control on the same paired seeds
npm run sim -- --all-policies --all-signs --runs 1000 --strict --variant open-questions-decisions --out reports/candidate
npm run sim -- --all-policies --all-signs --runs 1000 --strict --out reports/control
# Harder-finale checks on the candidate
npm run sim -- --all-policies --all-signs --runs 1000 --variant open-questions-decisions --variant final-n10 --out reports/candidate-n10
```

The candidate's numbers are experimental. None of them is a balance claim until the F1–F3 comparisons (tasks T6/T7) are run and reported.

## Layout

- `src/core/`: pure rules engine. It must not import React, Zustand, Node built-ins, `fs` or `path`, or use `process` or ambient randomness/time (`Math.random`, `Date.now`, `new Date()`, `performance.now`, `crypto.*`). This is enforced by `src/tests/core-purity.test.ts`.
  - `src/core/index.ts`: public API for campaign creation, home and pilgrimage actions, available actions, calendar and derived stats. The reducer applies actions atomically, resolves collapse and convalescence, and enforces the deadline. Regular pilgrimages support encounters, checkpoints, retreat, return home, wipeout, and carrying one equipment item and one consumable. The final gauntlet unlocks at the last checkpoint, supports retries, and grants immediate victory even in the final week.
  - `src/core/pilgrimage.ts`: regular-segment and final-gauntlet state machine. Threats and checks use `rng.encounters`; Coin rewards use `rng.rewards`. Each segment entry spends one week and locks its lunar phase; encounters, retreat and banking spend no additional week, while wipeout convalescence is bounded by the deadline.
    - Consumables follow stage rules: Theriac and St. John's Wort between encounters or at waystations; Metheglin after a failed check, before its penalty. Equipment returns after wipeout; unused consumables are lost. Optional New Moon skipping is enabled by a non-null `astrology.newMoon.skipFee`. It is paid from carried Coin once per segment entered during the New Moon, without a roll or loot, and counts toward the segment's encounters. It defaults off.
    - Wipeouts settle Coin and medical fees immediately. `failure.wipeoutBurdenReset` is `'zero'` (the default), `'unchanged'`, or `{ recovery: N }`, which recovers N from both burdens in the actual convalescence week. A home collapse charges `failure.homeCollapse.fee` (default 0) once per new collapse, as a `physician_fee`, before the forced convalescence.
  - `src/core/rng.ts`: pure seeded RNG (Mulberry32) with named substreams (`jobs`, `encounters`, `rewards`) derived from the master seed by splitmix32. Every draw takes a state and returns `{ value, state }`.
  - `src/core/config.ts`: typed `RulesConfig`. `loadConfig({ rules, items, variants })` merges and validates parsed JSON, `hashConfig` gives a stable config id, and `getUnresolved` lists every non-confirmed parameter (see [docs/unresolved-parameters.md](docs/unresolved-parameters.md)).
  - `src/core/encounter.ts`: encounter matchups, probability breakdowns, roll-under checks, road bonuses, and failure penalties. Functions take config last and use the shared equipment hooks in `src/core/items.ts`. Regular segments use indices `0..regularSegments-1`; the final gauntlet uses index `regularSegments`.
- `src/simulation/`: headless batch simulation tooling.
  - `src/simulation/runner.ts`: `runCampaign({ seed, sign, policy, config, trace?, strict?, maxSteps? })` drives one campaign to victory or deadline, asking a `Policy` (`decide(state, available, derived, calendar)`) for each action. It returns `{ finalState, events, decisions }`, where each decision records its week, the pre-roll probability of any check it resolved, and its event range; `trace` adds before/after snapshots and `strict` runs the D1 invariant checker on every transition. `deriveBatchSeed(baseSeed, sign, runIndex)` gives policy-independent paired seeds.
  - `src/simulation/policies.ts`: `createPolicy(id, config, params?)` and `createPolicies(config, params?)` provide seven bots for E3: `stables-only`, `specialist-b`, `specialist-o`, `specialist-l`, `balanced`, `reckless`, and `pragmatic`. Pass a policy directly to `runCampaign`, or select it by ID in the CLI through the `POLICIES` registry (each factory receives the CLI's loaded config and uses default params). Policies use visible stats, burdens, carried Coin, threats, inventory and calendar, without reading the seed or RNG streams. Ties follow Estate/action order for deterministic replay.
  - `src/simulation/metrics.ts`: `runRecord(events, finalState, meta)` derives every tech §12 per-run field from the event stream (with `runMetaFromConfig` supplying calendar length, fee cap, matchup cycle and final ceilings via the public API). `aggregate(records)` groups by policy × sign, plus an `all` row per policy: Wilson 95% victory CI, victory-week and checkpoint distributions, wipeout causes, calendar utilization, matchup/approach rates, Coin flows by source, and deadline-versus-resource-loop attribution. Final-gauntlet progress includes survived failures and skips, excluding fatal or pending checks. Terminal settlements are included in the last spent week’s snapshot; empty treasury and empty total purse are reported separately. The resource-loop attribution uses a configurable closing window (default 24 weeks), so it is a reporting heuristic.
  - `src/simulation/cli.ts`: `npm run sim -- …` (tech §14). Selects policies (`--policy`/`--all-policies`, from the `POLICIES` registry in `policies.ts`) and signs (`--birth-sign`/`--all-signs`); runs `--runs` campaigns each on paired seeds derived from `--seed`; loads `--config` over defaults (a full rules file or overlay, including `content/rules.experimental.json`), then `--variant` overlays (a name under `content/variants/` or a path) and the `--weeks` sensitivity override; `--strict` checks invariants. `--trace` prints a week-by-week log (date, moon and solar aspect, condition, then each action with its probability, roll and deltas; pilgrimage actions label their locked segment moon); `--trace-seed S` replays one campaign with literal seed S. It prints a policy × sign summary table; `--out <dir>` writes `runs.csv`, `summary.json`, `summary.md`, compatible `runs.ndjson` and `aggregates.json`, and `events.ndjson` for `--trace-seed` runs. Exit codes: 0 ok, 1 campaign error, 2 usage error.
  - `src/simulation/report.ts`: deterministic CSV/JSON/Markdown rendering and `writeReport(directory, input, cwd?)`. Reports carry the effective config/hash, unresolved assumptions, policy params, CLI argv, the source repository's Git commit when available, and E2 aggregates. Ten report tests include checked-in golden files for a fixed five-run batch; CLI tests cover the output integration.
- `src/tests/`: Vitest tests. Import `describe`/`it`/`expect` from `vitest` explicitly. Use `loadContentConfig()` from `src/tests/support/config.ts` to get the default config.
- `src/tests/scenarios/`: D2 deterministic rule and engine scenarios. Run with `npm test -- src/tests/scenarios`. Home scenarios activate when `src/core/index.ts` exists; C2–C4 owners must enable their `ENGINE_SUITES` flag in `harness.ts` when implementing the feature. Explicit flags prevent a regression from silently skipping an enabled suite. Pending engine scenarios are skipped until their dependencies land.
- `content/`: game data. `rules.default.json` holds the rules with every unconfirmed value flagged in its `provenance` map, `items.json` is the item catalog, and `rules.experimental.json` is the overlay used for simulation baselines (config-only balance changes go there).
  - `content/variants/`: named overlays for sensitivity runs, each with its own `id` (so config hashes differ) and an `experimental` provenance note for every value it changes. `route-4`/`route-5`/`route-6` set the segment count with the linear +40 → +0 road bonus; `road-flat`/`road-steep` halve or double the road-bonus slope at the same mean (five-segment routes only); `final-n6`/`final-n8`/`final-n10` set the final gauntlet size and `final-road-10`/`-20`/`-30` its road bonus (negative); `items-test-table` switches the acquisition mode to the equal-weight test table (note: `drawItemReward` has no campaign caller yet, so campaigns still grant no items; natural acquisition is the separate T8 follow-up); `astrology-full` is the earlier E6 lunar comparison control (New Moon +10% to Smuggler/Alehouse gains and payouts, 10-Coin encounter skip, Full Moon +10% Bellatores/Oratores gains and payouts); `open-questions-decisions` is the selected candidate described above; `weeks-48` is the 48-week sensitivity calendar. Variants stack in order (`loadConfig({ variants })` or repeated `--variant` flags). Applying `road-flat`/`road-steep` after `route-4`/`route-6` fails validation (five bonuses for a different segment count); applying the route variant last replaces the curve. For example, `--variant route-6 --variant final-n10 --variant weeks-48` combines independent sensitivities.
- `docs/`: planning docs. Finished ones move to `docs/archive/`.

## Policy bots (E3)

```ts
import { createPolicy } from './src/simulation/policies.js';
import { runCampaign } from './src/simulation/runner.js';

// config is a validated RulesConfig from loadConfig().
const policy = createPolicy('pragmatic', config, { survivalThreshold: 0.7 });
const result = runCampaign({ seed: 123, sign: 'aries', policy, config, strict: true });
```

Stables-only works Stables and rests near either burden ceiling. Non-reckless bots whose stats meet `departureStat` take the largest affordable rest until burdens are within `departureBurden`, so they can depart. Specialists tutor, work and approach in their Estate. Balanced trains its weakest stat and chooses the highest-odds job and encounter approach. Automatic Stables counts as 100%, so Balanced uses it whenever it is available. Reckless departs as soon as possible with minimum carry; it exits when a failure using its preferred approach against any possible next threat would wipe it out. Pragmatic uses Waning recovery, Trine work and a survival estimate to gate departure and continuation. Bots take available equipment (preferring a specialist's Estate) and consumables (preferring Metheglin), and use recovery items when burdened.

All strategy thresholds are copied into `policy.params` and validated. Defaults are experimental:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `restMargin` | 15 | Rest within this distance of either ceiling; also the recovery-item burden threshold |
| `departureStat` | 40 | Minimum specialist stat, or minimum of all stats for Balanced/Pragmatic |
| `departureBurden` | 15 | Maximum burden at a prepared departure |
| `retreatMargin` | 20 | Distance from either ceiling that triggers a specialist/Balanced exit |
| `trainingReserve` | 40 | Work below this treasury balance; otherwise tutor if affordable |
| `carryFailures` | 3 | Carry at least this times the configured failure penalty (baseline 15); Reckless uses minimum legal carry |
| `survivalThreshold` | 0.65 | Pragmatic's minimum estimated segment survival probability |
| `waningRestMinimum` | 10 | Minimum burden for Pragmatic's Waning recovery |

Pragmatic estimates remaining-segment survival using a binomial failure budget: average best-approach success odds over configured threat weights, with the smallest failure capacity of the resources those approaches spend. It uses segment-locked lunar phases, equipment penalties, current ceilings and carried Coin; next-segment decisions use the upcoming entry moon. The estimate conservatively charges every failure against the bottleneck resource and ignores future rewards and consumables. It is a heuristic for simulation comparisons, not an exact survival probability or a balance conclusion.

Run bot tests, including 20 seeded campaigns per policy with strict invariants and decision-trace replay, with `npm test -- src/tests/policies.test.ts`.

## Report exports (E5)

Pass `--out <directory>` to the simulation CLI to write:

| File | Contents |
| --- | --- |
| `runs.csv` | One row per campaign, with all E2 run metrics. Stats, ceilings, calendar counts and wipeout causes have separate dotted columns. Variable maps (jobs, encounters, Coin sources, items, checkpoints) and weekly series are JSON-valued cells. RFC-style quoting, CRLF rows, and blank null values. |
| `summary.json` | Schema version, config hash and full effective config snapshot, unresolved parameter values/notes, source Git commit (or null), exact CLI args, policy params, run count, astrology status, policy × sign aggregates, diagnostic flags and selected trace metadata. |
| `summary.md` | Reproduction commands and tables for outcomes/uncertainty, checkpoints, risk/recovery, final stats, economy, matchup shares, calendar use and flagged anomalies. |
| `events.ndjson` | Only for `--trace-seed` with `--out`. Each line contains `policy`, `birthSign`, literal `seed`, `configId`, zero-based `eventIndex` and the original `event`. Multiple policy/sign traces remain distinguishable even with a shared seed. |
| `runs.ndjson`, `aggregates.json` | E4 raw metrics outputs, retained for compatibility. |

A normal `--trace` prints logs without exporting events. Reusing a directory replaces its generated reports and removes any stale `events.ndjson` when the new report has no selected seed. Ordinary batches retain compact run records, not full event streams across campaigns. Report rendering does not include timestamps, so fixed inputs and an explicit Git commit produce byte-identical exports.

The Markdown report is labeled **partial astrology** when any lunar feature is switched off in the effective config (New Moon bonus 0, Full Moon surge 0, or a null skip fee), whatever its provenance status. Otherwise it says **configured astrology**; this does not resolve the remaining assumptions. `summary.json` lists them in `astrology.disabledParameters`; the legacy `disabledTbdParameters` field keeps only those still marked `tbd`. The risk table reports medical and physician fees actually paid, their shortfall rates, home collapses and New Moon skips (which are never counted as encounter rolls). Diagnostic flags count affected runs for unfinished campaigns, empty treasury, medical- and physician-fee shortfalls, resource-loop attribution, home collapses and rejected departures. They are observations for investigation, not balance conclusions. The standard runner records accepted actions, so rejected departure counts require caller-supplied metrics. The resource-loop classification uses E2's heuristic (default closing window: 24 weeks).

To inspect a batch row, use its literal seed and original policy/sign:

```sh
npm run sim -- --policy pragmatic --birth-sign aries --trace-seed 123 --out reports/debug
```

Reuse the original config/variant/week arguments and policy params. To restore the exact rules, save the `config` property of `summary.json` as a separate JSON file and pass it with `--config <snapshot.json>`; keep the recorded code revision and policy params as well. E5 tests inject deterministic policies, so report goldens do not change when bot heuristics are tuned.
