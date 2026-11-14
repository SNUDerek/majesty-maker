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
| `npm run dev` | Run the browser UI with Vite (see [Running the UI](#running-the-ui)) |
| `npm run build` | Type-check the UI and build it into `dist/` |
| `npm run typecheck:ui` | Type-check `src/ui` with `tsconfig.ui.json` |

## Running the UI

`npm run dev` serves the playtest UI at the printed URL (default `http://localhost:5173/`). A full campaign is playable: title, intro (text appears letter by letter; Enter, Space or a click completes the line, then advances; Esc or *Skip* jumps ahead), setup (names and birth sign), the home hub with Tutoring / Work / Rest, pilgrimage preparation (a four-page guide to the road, the three orders, failure, and the moon and retreat opens on the first visit in each browser; *?* on Prep and the road HUD reopens it), encounters, waystations, the Final Gauntlet, and the victory or deadline outcome. The game autosaves after every action; *Menu* (top right) opens Save / Load with three manual slots and Quit to title. *Chronicle* lists every action so far, newest first, with its result and net changes; it is stored with each save. Keys: 1/2/3 choose an encounter approach, Esc leaves a sub-screen, Enter confirms dialogs.

The layout is a fixed 1280×720 stage scaled to fit the window, so any 16:9 window looks the same; browser zoom is not needed.

URL switches:

- `?dev` adds a dev drawer (bottom-left): a fixed seed for the next New Game, a rules switch (`default`, `default+items` with every item ×3 to exercise item slots, Theriac/Wort and Metheglin, `experimental`, `legacy`), state and last-event JSON dumps, and a labelled +100 Coin cheat. Switching rules returns to the title; saves made under other rules load only after a confirmation.
- `?gallery` shows every UI component on one screen.

`npm run build` type-checks the UI and writes a static build to `dist/` (relative paths, so it can be opened from any static host).

## Simulation CLI

```sh
npm run sim -- --help
npm run sim -- --policy pragmatic --birth-sign aries --seed 123 --trace
npm run sim -- --all-policies --all-signs --runs 1000 --out reports/baseline
```

Policy IDs are the seven E3 bots (see [Policy bots](#policy-bots-e3)). Use `--config content/rules.experimental.json` for the experimental baseline and `--variant <name-or-path>` for additional overlays. `--trace-seed <seed>` replays a literal campaign seed from batch records; omit `--seed` and `--runs` when using it.

### Current POC defaults

The shipped defaults use the settled open-question rules with **no opposing-stat loss from tutors**, **10 finale encounters**, and a **−30 finale road bonus**. The calendar remains 96 weeks; regular segments still advance on survived encounters. These modest changes support hybrid builds and increase finale difficulty without adding new mechanics.

`content/rules.legacy.json` preserves the old shipped control, and `content/rules.experimental.json` preserves the full stages 0–1 experimental baseline. Use `--config` to replay either historical configuration.

### Open-question decisions candidate

The rules settled in [the archived decision record](docs/archive/open-questions-tasks.md) are implemented in the engine. The **legacy control** values are preserved in `content/rules.legacy.json` for comparisons on the same executable. The selected values are in the `open-questions-decisions` variant: tutor burdens 5/0, 0/5, 3/2; Square doubling both tutor burdens; Purse Protection on failed Laboratores encounters; Waxing ×1.20; New/Full Moon home bonuses +20%; 10-Coin New Moon skip; retreat toll 10; wipeout recovery −35/−35; and a 20-Coin home-collapse physician fee.

```sh
# Candidate and legacy control on the same paired seeds
npm run sim -- --all-policies --all-signs --runs 1000 --strict --config content/rules.legacy.json --variant open-questions-decisions --out reports/candidate
npm run sim -- --all-policies --all-signs --runs 1000 --strict --config content/rules.legacy.json --out reports/control
# Harder-finale checks on the candidate
npm run sim -- --all-policies --all-signs --runs 1000 --config content/rules.legacy.json --variant open-questions-decisions --variant final-n10 --out reports/candidate-n10
```

The candidate's numbers are experimental. `content/rules.experimental.json` (the experimental baseline) holds the same values. The first controlled comparison is in [docs/balance-report-baseline.md](docs/balance-report-baseline.md): the settled rules help generalist bots, but specialists still win nearly every run, so this is not a balance claim. The overlays used for single-rule comparisons are in `content/experiments/open-questions/`.

### Balance testing (rewarding a rounded scion)

[docs/balance-testing.md](docs/balance-testing.md) is the plan; [docs/balance-report-stage1.md](docs/balance-report-stage1.md) is the interim report for stages 0–1. The build-policy presets (`spec-*`, `duo-*`, `hybrid-*`, `even`, `wealthy-l`) are selectable by name but are not part of `--all-policies`, so the seven published bots and their reports are unchanged:

```sh
npm run sim -- --policy hybrid-b --all-signs --runs 1000 --seed 20261113 --strict --config content/rules.experimental.json
npx tsx scripts/balance-testing/run.ts --stage 0 --out reports/balance/stage0
npx tsx scripts/balance-testing/run.ts --stage 1 --out reports/balance/stage1
npx tsx scripts/balance-testing/analyze.ts --stage0 reports/balance/stage0 --stage1 reports/balance/stage1 > tables.md
```

The S3/S4 overlays are in `content/experiments/balance/`.

## Layout

- `src/core/`: pure rules engine. It must not import React, Zustand, Node built-ins, `fs` or `path`, or use `process` or ambient randomness/time (`Math.random`, `Date.now`, `new Date()`, `performance.now`, `crypto.*`). This is enforced by `src/tests/core-purity.test.ts`.
  - `src/core/index.ts`: public API for campaign creation, home and pilgrimage actions, available actions, calendar and derived stats. The reducer applies actions atomically, resolves collapse and convalescence, and enforces the deadline. Regular pilgrimages support encounters, checkpoints, retreat, return home, wipeout, and carrying one equipment item and one consumable. The final gauntlet unlocks at the last checkpoint, supports retries, and grants immediate victory even in the final week.
  - `STORY_BEAT { beatId, reward? }` (docs/dialog-and-story-beats-plan.md §7) records a played story beat in the optional `CampaignState.storyBeats` (beat id → week) and grants its Coin (`story_reward`, capped at `treasuryMax`) and items (`reward`, regardless of `items.acquisition`). It is home-only, refused during convalescence or for a replayed beat, spends no week, draws no randomness and leaves Waxing alone. `getAvailableActions` never lists it; the UI calls it after a dialog scene. Optional rewards must be objects with non-negative safe-integer Coin and an array of known item IDs; malformed rewards are rejected atomically.
  - `src/core/preview.ts`: draw-free `previewHomeActivity` and `previewApproaches`, exported through the public API. Home previews report modified costs, affordability, astrology sources, job odds, clamped activity deltas and collapse warnings; collapse fees and subsequent recovery are not included in those deltas. Encounter previews report odds, rewards and failure penalties, restricted to the chosen approach during a reroll prompt. Use `getAvailableActions` for availability. U1–U8 of the [archived UI technical plan](docs/archive/ui-technical-plan.md) are implemented; the full browser campaign is playable.
  - `src/core/pilgrimage.ts`: regular-segment and final-gauntlet state machine. Threats and checks use `rng.encounters`; Coin rewards use `rng.rewards`. Each segment entry spends one week and locks its lunar phase; encounters, retreat and banking spend no additional week, while wipeout convalescence is bounded by the deadline.
    - Consumables follow stage rules: Theriac and St. John's Wort between encounters or at waystations; Metheglin after a failed check, before its penalty. Equipment returns after wipeout; unused consumables are lost. Optional New Moon skipping is enabled by a non-null `astrology.newMoon.skipFee`. It is paid from carried Coin once per segment entered during the New Moon, without a roll or loot, and counts toward the segment's encounters. It defaults off.
    - Wipeouts settle Coin and medical fees immediately. `failure.wipeoutBurdenReset` is `'zero'` (the default), `'unchanged'`, or `{ recovery: N }`, which recovers N from both burdens in the actual convalescence week. A home collapse charges `failure.homeCollapse.fee` (default 0) once per new collapse, as a `physician_fee`, before the forced convalescence.
  - `src/core/rng.ts`: pure seeded RNG (Mulberry32) with named substreams (`jobs`, `encounters`, `rewards`) derived from the master seed by splitmix32. Every draw takes a state and returns `{ value, state }`.
  - `src/core/config.ts`: typed `RulesConfig`. `loadConfig({ rules, items, variants })` merges and validates parsed JSON, `hashConfig` gives a stable config id, and `getUnresolved` lists every non-confirmed parameter (see [docs/unresolved-parameters.md](docs/unresolved-parameters.md)).
  - `src/core/encounter.ts`: encounter matchups, probability breakdowns, roll-under checks, road bonuses, and failure penalties. Functions take config last and use the shared equipment hooks in `src/core/items.ts`. Regular segments use indices `0..regularSegments-1`; the final gauntlet uses index `regularSegments`.
- `src/ui/`: React + Vite playtest UI (docs/archive/ui-technical-plan.md). It imports only `src/core/index.ts` and the `content/` JSON; every number on screen comes from the engine. Type-checked by `tsconfig.ui.json` (the root `tsconfig.json` excludes it).
  - `src/ui/engine/`: plain-TS logic tested under `src/tests/ui-*.test.ts`: `GameStore` (wraps `applyAction`, validates against `getAvailableActions`, autosaves), `deriveScreen` (screen from engine state), `summarize` (events → result panel), `persistence` (versioned localStorage saves with `configHash`), `slots` (save-slot descriptions), `chronicle` (one log entry per action, saved with the game), `activities` (activity previews and disabled reasons), `tutorial` (the config-driven pilgrimage guide and its per-browser seen flag) and `road` (segment info, departure options, the locked segment moon and a draw-free retreat preview).
  - `src/ui/components/`, `src/ui/screens/`: Kenney-framed components on a fixed 1280×720 stage scaled with CSS `zoom`. Screens: title, intro, setup, home hub, Tutor/Work/Rest, pilgrimage prep, encounter, waystation, outcome, Save/Load, Chronicle, pilgrimage guide and Credits overlays, and the `?dev` drawer. `src/ui/text/` holds display labels and the intro script.
- `src/simulation/`: headless batch simulation tooling.
  - `src/simulation/runner.ts`: `runCampaign({ seed, sign, policy, config, trace?, strict?, maxSteps? })` drives one campaign to victory or deadline, asking a `Policy` (`decide(state, available, derived, calendar)`) for each action. It returns `{ finalState, events, decisions }`, where each decision records its week, the pre-roll probability of any check it resolved, and its event range; `trace` adds before/after snapshots and `strict` runs the D1 invariant checker on every transition. `deriveBatchSeed(baseSeed, sign, runIndex)` gives policy-independent paired seeds.
  - `src/simulation/policies.ts`: `createPolicy(id, config, params?)` and `createPolicies(config, params?)` provide seven bots for E3: `stables-only`, `specialist-b`, `specialist-o`, `specialist-l`, `balanced`, `reckless`, and `pragmatic`. Pass a policy directly to `runCampaign`, or select it by ID in the CLI through the `POLICIES` registry (each factory receives the CLI's loaded config and uses default params). Policies use visible stats, burdens, carried Coin, threats, inventory and calendar, without reading the seed or RNG streams. Ties follow Estate/action order for deterministic replay.
  - `src/simulation/build-policy.ts`: `createBuildPolicy(id, config, overrides?)`, the parametrised balance-testing bot (docs/balance-testing.md §4). Build targets (lead, the Estate the lead beats, the third), `endingFloor` and an optional `tutorBudget` shape her training; targets and the floor gate the finale. She departs on the survival estimate, burdens and a Coin budget (Laboratores failures plus the New Moon skip fee, falling back to what she can carry), works by expected Coin, and picks the best approach per card. Presets are in `BUILD_PRESETS`; create one policy per campaign.
  - `src/simulation/balance-metrics.ts`: `balanceRecord(events, finalState, meta)` (stat profiles at victory and first departure, lessons, non-lead approach share by threat, cards per visit, purse and skips), `summarizeBalance(records)` (win-by-week over all campaigns, ending eligibility at 20/30/40) and `pairedDifference(a, b, value)` (paired by sign and seed, 95% interval).
  - `src/simulation/metrics.ts`: `runRecord(events, finalState, meta)` derives every tech §12 per-run field from the event stream (with `runMetaFromConfig` supplying calendar length, fee cap, matchup cycle and final ceilings via the public API). `aggregate(records)` groups by policy × sign, plus an `all` row per policy: Wilson 95% victory CI, victory-week and checkpoint distributions, wipeout causes, calendar utilization, matchup/approach rates, Coin flows by source, and deadline-versus-resource-loop attribution. Final-gauntlet progress includes survived failures and skips, excluding fatal or pending checks. Terminal settlements are included in the last spent week’s snapshot; empty treasury and empty total purse are reported separately. The resource-loop attribution uses a configurable closing window (default 24 weeks), so it is a reporting heuristic.
  - `src/simulation/cli.ts`: `npm run sim -- …` (tech §14). Selects policies (`--policy`/`--all-policies`, from the `POLICIES` registry in `policies.ts`) and signs (`--birth-sign`/`--all-signs`); runs `--runs` campaigns each on paired seeds derived from `--seed`; loads `--config` over defaults (a full rules file or overlay, including the historical `content/rules.experimental.json` snapshot), then `--variant` overlays (a name under `content/variants/` or a path) and the `--weeks` sensitivity override; `--strict` checks invariants. `--trace` prints a week-by-week log (date, moon and solar aspect, condition, then each action with its probability, roll and deltas; pilgrimage actions label their locked segment moon); `--trace-seed S` replays one campaign with literal seed S. It prints a policy × sign summary table; `--out <dir>` writes `runs.csv`, `summary.json`, `summary.md`, compatible `runs.ndjson` and `aggregates.json`, and `events.ndjson` for `--trace-seed` runs. Exit codes: 0 ok, 1 campaign error, 2 usage error.
  - `src/simulation/report.ts`: deterministic CSV/JSON/Markdown rendering and `writeReport(directory, input, cwd?)`. Reports carry the effective config/hash, unresolved assumptions, policy params, CLI argv, the source repository's Git commit when available, and E2 aggregates. Ten report tests include checked-in golden files for a fixed five-run batch; CLI tests cover the output integration.
- `src/tests/`: Vitest tests. Import `describe`/`it`/`expect` from `vitest` explicitly. Use `loadContentConfig()` from `src/tests/support/config.ts` for historical rule fixtures, or `loadShippedConfig()` for current POC defaults.
- `src/tests/scenarios/`: D2 deterministic rule and engine scenarios. Run with `npm test -- src/tests/scenarios`. Home scenarios activate when `src/core/index.ts` exists; C2–C4 owners must enable their `ENGINE_SUITES` flag in `harness.ts` when implementing the feature. Explicit flags prevent a regression from silently skipping an enabled suite. Pending engine scenarios are skipped until their dependencies land.
- `content/`: game data. `rules.default.json` holds the rules with every unconfirmed value flagged in its `provenance` map, `items.json` is the item catalog, and `rules.experimental.json` is the frozen full experimental baseline for the published balance reports; `rules.legacy.json` preserves the earlier control.
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

The [active follow-up tasks](docs/open-questions-tasks.md) retain T8 and the remaining balance validation. Portable matrix, paired-analysis, and threshold-sensitivity scripts are in `scripts/open-questions`; see the [reproduction commands](docs/balance-report-baseline.md#baseline-promoted-t7). Historical config snapshots receive legacy defaults for the new Square Fatigue factor (100%) and home physician fee (0 Coin).

PR #29 review details are in the [B1–B3 delivery archive](docs/archive/balance-testing-b1-b3.md). Budget probes compare equal tutor spending caps, with actual spend reported; an ending floor remains mandatory even after tutoring funds run out. The stage runner records completion status, and analysis rejects incomplete or duplicate campaign samples. Conditional rule changes still await the [designer gate](docs/balance-testing.md#5-experiment-stages).

UI review regressions: with the dev server running and Playwright/Chromium available, run `node scripts/check-ui.cjs` (optional URL argument; `NODE_PATH` can point to an existing Playwright installation). It checks the New Game flow, that parchment content stays inside the paper's drawn edge, gauge fills, projected condition ceilings, result-modal keyboard containment and focus return, and the home activity flow, the Chronicle and the pilgrimage guide (shown on the first Prep visit only, reopened by *?*) at 1280×720 and 1920×1080. `node scripts/playtest-ui.cjs [--seed N] [--size WxH] [--home-only] [--shots DIR] [--url URL]` plays one whole campaign through the UI, clicking only what a player sees, and prints the outcome (`--home-only` never departs, to reach the deadline). Save loading rejects malformed inventory, RNG and core state fields before entering the game.

Run `node scripts/check-menus.cjs [URL]` for save/load, confirmation focus, corrupt-save recovery, and dev-input keyboard regressions. Run `node scripts/check-road.cjs [URL]` against the Vite dev server for engine-generated reroll, wipeout, remedy, retreat and New Moon bribe fixtures. Both use the same Playwright prerequisites.

Flavor text is authored in `content/flavor.json`: tutor lines, job success/failure
lines, and idle/talk-ready thoughts. Lists can grow without code changes; Stables
needs no failure lines. `{scion}` inserts the daughter's name and `{player}` the
player's first name. Selection is deterministic for the campaign seed, week, and
text slot, independent of gameplay RNG. Tutor/job result popups show narration;
the home thought box is hidden during forced recovery. Talk-ready thoughts are
reserved for the later Social/story-beat integration.

### Dialogue preview

Run `npm run dev` and open `?gallery`. Select a scene and click **Play scene**.
Use the small arrow, Enter, or Space to advance; choices appear as buttons.

Self-contained `content/story/*.ink` files compile through the shared Vite/Vitest
plugin using pinned inkjs 2.3.2. Declare `scion`, `player`, `bellatores`, `oratores`,
and `laboratores` in each file. Add an `# order: 10` tag to a knot to list it in
the Gallery. Known character IDs followed by `:` produce speech; parenthesized
speech is a thought; other text is narration. `bg`, `left`, and `right` tags set
background and portrait IDs. See `src/tests/fixtures/sample.ink` for a short branching example.
Files can also be previewed in Inky. `INCLUDE` is unsupported in this pass.
The player resets Ink for each scene; Gallery previews do not grant rewards.

### Story beats

Each `content/story/*.ink` file is a thread; each knot with an `# order:` tag is a
beat with id `<file>/<knot>` (docs/dialog-and-story-beats-plan.md §5.5–§6). Knot tags:
`# title:` (Chronicle name, default the knot), `# order:` (position in the thread),
`# activity:` (space-separated activity ids, or `socialize` for the Social button),
`# month:` (earliest month, default 1), `# stat: <estate> <min>` and
`# reward: coin <n>` / `# reward: item <id>` (both repeatable), plus `# bg:` and
`# left:`. A file-level `# cooldown: <weeks>` (default 2) spaces a thread's beats.

After a lesson, job or rest, the thread's next unplayed beat plays if its activity,
month, post-activity stats and cooldown all match, at most one beat per week; the
result panel waits behind the scene. Beats are skipped after the forced recovery
week, a collapse, or the deadline. **Social** opens the next father–daughter talk
for free and is greyed out otherwise; the daughter's thought hints when one is
ready. The end of a scene applies the core `STORY_BEAT` action (rewards, Chronicle
entry "A story: <title>"); quitting mid-scene leaves the beat unplayed.
`src/tests/ui-story.test.ts` validates every beat's tags against the real ids.

`node scripts/check-dialog.cjs [URL]` plays a Gallery scene, a Social talk and a
lesson's beat in the browser (same Playwright prerequisites).
