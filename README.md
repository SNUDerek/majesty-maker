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

## Layout

- `src/core/`: pure rules engine. It must not import React, Zustand, Node built-ins, `fs` or `path`, or use `process` or ambient randomness/time (`Math.random`, `Date.now`, `new Date()`, `performance.now`, `crypto.*`). This is enforced by `src/tests/core-purity.test.ts`.
  - `src/core/index.ts`: public API for campaign creation, home and pilgrimage actions, available actions, calendar and derived stats. The reducer applies actions atomically, resolves collapse and convalescence, and enforces the deadline. Regular pilgrimages support encounters, checkpoints, retreat, return home, wipeout, and carrying one equipment item and one consumable; the final gauntlet awaits C4.
  - `src/core/pilgrimage.ts`: regular-segment state machine. Threats and checks use `rng.encounters`; Coin rewards use `rng.rewards`. Each segment entry spends one week and locks its lunar phase; encounters, retreat and banking spend no additional week, while wipeout convalescence is bounded by the deadline.
    - Consumables follow stage rules: Theriac and St. John's Wort between encounters or at waystations; Metheglin after a failed check, before its penalty. Equipment returns after wipeout; unused consumables are lost. Optional New Moon skipping is enabled by a non-null `astrology.newMoon.skipFee`, paid from carried Coin once per segment without a roll; it defaults off.
  - `src/core/rng.ts`: pure seeded RNG (Mulberry32) with named substreams (`jobs`, `encounters`, `rewards`) derived from the master seed by splitmix32. Every draw takes a state and returns `{ value, state }`.
  - `src/core/config.ts`: typed `RulesConfig`. `loadConfig({ rules, items, variants })` merges and validates parsed JSON, `hashConfig` gives a stable config id, and `getUnresolved` lists every non-confirmed parameter (see [docs/unresolved-parameters.md](docs/unresolved-parameters.md)).
  - `src/core/encounter.ts`: encounter matchups, probability breakdowns, roll-under checks, road bonuses, and failure penalties. Functions take config last and use the shared equipment hooks in `src/core/items.ts`. Regular segments use indices `0..regularSegments-1`; the final gauntlet uses index `regularSegments`.
- `src/simulation/`: headless batch simulation tooling.
- `src/tests/`: Vitest tests. Import `describe`/`it`/`expect` from `vitest` explicitly. Use `loadContentConfig()` from `src/tests/support/config.ts` to get the default config.
- `src/tests/scenarios/`: D2 deterministic rule and engine scenarios. Run with `npm test -- src/tests/scenarios`. Home scenarios activate when `src/core/index.ts` exists; C2–C4 owners must enable their `ENGINE_SUITES` flag in `harness.ts` when implementing the feature. Explicit flags prevent a regression from silently skipping an enabled suite. Pending engine scenarios are skipped until their dependencies land.
- `content/`: game data. `rules.default.json` holds the rules with every unconfirmed value flagged in its `provenance` map, `items.json` is the item catalog, and `rules.experimental.json` is the overlay used for simulation baselines (config-only balance changes go there).
- `docs/`: planning docs. Finished ones move to `docs/archive/`.
