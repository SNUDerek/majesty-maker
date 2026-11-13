# Parameter Register

This register lists every rules value whose **number** is not yet canon, along with the decision that settled the rule behind it. All thirteen open questions (Q1–Q13) and R1–R5 are resolved in [open-questions-tasks.md](open-questions-tasks.md). What remains open is numeric tuning, not rule semantics.

Each value has an explicit default in `content/rules.default.json` and a matching `provenance` entry. At runtime, `getUnresolved(config)` in `src/core/config.ts` lists the non-confirmed parameters with their current values, so reports can record them. `src/tests/config.test.ts` fails if this file is missing any path that the default config flags.

There are two configurations to keep apart:

- **Shipped default** (`rules.default.json`): the legacy control. Where a decision selected a different value, the default keeps the old one so rule changes can be compared on the same executable. These control values are marked **experimental** and their notes say "legacy control".
- **Candidate** (`content/variants/open-questions-decisions.json`, `--variant open-questions-decisions`): the selected values. Settled rules there are **confirmed**, citing the decision. Tunable numbers are **experimental**.

Statuses:

- **confirmed**: the rule (and, where applicable, value) is settled. Confirmed paths drop out of `getUnresolved`.
- **experimental**: a test value or legacy control. It is not canon and is not a claim of balance.
- **tbd**: the rule is not settled. No default parameter currently uses this status.

| Path | Shipped default | Default status | Candidate value | Resolution |
|---|---|---|---|---|
| `route.regularSegments` | `5` | experimental | same | R1: keep; tune in F1–F3 |
| `route.encountersPerSegment` | `5` | experimental | same | R1 |
| `route.finalEncounters` | `8` | experimental | same | R1; `final-n10` is the first harder-finale check |
| `route.finalRoadBonus` | `-20` | experimental | same | R1; `final-road-30` is the first harder-finale check |
| `classes.tutorBurden` | Knight 5/0, Hermit 0/5, Smuggler 5/5 | experimental (legacy control) | Smuggler 3/2 (experimental) | Q1: mapping settled; magnitudes/split experimental |
| `astrology.solar.squareTutorFatiguePct` | `100` (Melancholy-only Square) | experimental (legacy control) | `200` (confirmed) | Q5: Square doubles both tutor burdens |
| `astrology.newMoon.activityBonus` | `0` (off) | experimental (legacy control) | `20` (experimental) | Q12: Smuggler/Alehouse gains and payouts |
| `astrology.fullMoon.surge` | `0` (off) | experimental (legacy control) | `20` (experimental) | Q12: Knight/Hermit/Watch/Scriptorium gains and payouts |
| `astrology.newMoon.skipFee` | `null` (disabled) | experimental (legacy control) | `10` (experimental) | Q3/Q9: one skip per New Moon segment, carried Coin, counts toward N |
| `astrology.waxing.mode` | `"single"` | confirmed | same (confirmed) | Q4: one non-compounding bonus |
| `astrology.waxing.bonusPct` | `110` | experimental (legacy control) | `120` (experimental) | Q4: magnitude |
| `astrology.waning.appliesToRestAtHome` | `false` | confirmed | same (confirmed) | R2: paid rests only |
| `failure.retreatLootRetentionPct` | `50` | experimental | same (experimental) | R3: remaining earned loot only, floored |
| `failure.retreatToll` | `5` | experimental (legacy control) | `10` (experimental) | Q7: forfeit first, then carried, then treasury, never debt; R3: magnitude |
| `failure.wipeoutBurdenReset` | `"zero"` | experimental (legacy control) | `{ recovery: 35 }` (experimental) | Q13: recovery in the actual convalescence week; none without a week |
| `failure.homeCollapse` | `{ forcedWeek: true, recovery: 15, fee: 0 }` | experimental (legacy control) | `fee: 20` (experimental) | Q13: physician fee once per new collapse; forced −15/−15 weeks |
| `failure.purseProtection.appliesToLabFailures` | `false` | experimental (legacy control) | `true` (confirmed) | Q2: applies to failed Laboratores encounters and wipeouts |
| `items.acquisition` | `"disabled"` | confirmed | same (confirmed) | R4: item-free baseline; the T8 experiment is a separate follow-up |
| `items.testRewardTable` | Equal weight (1) for each of the six items | experimental | same | R5: test fixture only, no production rarity implied |

## Rules owned by modules

Some decisions are about rule logic, not a single config value. Being absent from the table above does **not** mean a question was settled implicitly; each was settled explicitly in [open-questions-tasks.md](open-questions-tasks.md) and is covered by `src/tests/open-questions.test.ts`:

- Q6: Full Moon doubles the base Fatigue/Melancholy penalty before the Gambeson's −5 (`src/core/encounter.ts`).
- Q8: Theriac/Wort between encounters and at waystation decisions; Metheglin only during a pending failed roll (`src/core/items.ts`).
- Q10: Saint's Relic adds 10 percentage points against Oratores threats, any approach, before the clamp (`src/core/encounter.ts`).
- Q11: Opposition ×1.5 applies to job success and failure burdens, Stables included, floored once (`src/core/astrology.ts`).

Open questions are numbered as in [implementation-tasks.md §5](implementation-tasks.md#5-open-questions-found-while-planning).
