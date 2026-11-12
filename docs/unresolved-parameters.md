# Unresolved-Parameter Register

Every rules value that the design docs have **not** confirmed. Each one has an explicit default in `content/rules.default.json` and a matching `provenance` entry. At runtime, `getUnresolved(config)` in `src/core/config.ts` lists these parameters with their current values, so reports can record them. `src/tests/config.test.ts` fails if this file is missing any path that the config flags.

Statuses:

- **experimental**: a suggested value to start simulations with. It is a test parameter, not canon.
- **tbd**: the design hasn't settled the rule. The default only keeps simulations runnable and must not be presented as final.

Values that aren't listed here are confirmed (tech doc §10).

| Path | Default | Status | Notes | Open question |
|---|---|---|---|---|
| `route.regularSegments` | `5` | experimental | Suggested initial balance value (tech §7). | — |
| `route.encountersPerSegment` | `5` | experimental | Suggested initial balance value (tech §7). | — |
| `route.finalEncounters` | `8` | experimental | Suggested initial balance value (tech §7). | — |
| `route.finalRoadBonus` | `-20` | experimental | Suggested initial test value (tech §7). | — |
| `classes.tutorBurden` | Hedge Knight +5 Fatigue; Hermit +5 Melancholy; Smuggler +5 Fatigue / +5 Melancholy | tbd | Candidate baseline only (tech §5). | Q1, Q5 |
| `astrology.newMoon.activityBonus` | `0` (off) | tbd | Magnitude unspecified. With it at 0, reports are labelled "partial astrology". | Q12 |
| `astrology.fullMoon.surge` | `0` (off) | tbd | Magnitude unspecified. With it at 0, reports are labelled "partial astrology". | Q12 |
| `astrology.newMoon.skipFee` | `null` (skipping disabled) | tbd | Fee unspecified. | Q3, Q9 |
| `astrology.waxing.mode` | `"single"` | tbd | The thematic doc says compounding; the tech doc says the bonus applies once. | Q4 |
| `astrology.waning.appliesToRestAtHome` | `false` | tbd | The source names only Bathhouse, Shrine and Banquet. | — |
| `failure.retreatLootRetentionPct` | `50` | experimental | Simulation-only. Only earned loot is reduced; floor rounding. | — |
| `failure.retreatToll` | `5` | experimental | Simulation-only. | Q7 (who pays) |
| `failure.wipeoutBurdenReset` | `"zero"` | tbd | Post-wipeout recovery unspecified. | Q13 |
| `failure.homeCollapse` | `{ forcedWeek: true, recovery: 15 }` | tbd | Provisional forced convalescence week with −15 Fatigue / −15 Melancholy (tech §4). | Q13 |
| `failure.purseProtection.appliesToLabFailures` | `false` | tbd | The thematic doc applies Purse Protection to failed Laboratores encounters; the tech doc applies it only on wipeout. | Q2 |
| `items.acquisition` | `"disabled"` | tbd | Drop rates are undecided; items are off for baseline runs. | — |

Open questions are numbered as in `docs/implementation-tasks.md` §9. Some open questions are about rule logic rather than a single config value, so they are not listed above. These are Q6 (Full Moon versus Gambeson order), Q8 (where consumables can be used), Q10 (how the Relic bonus applies) and Q11 (whether Opposition affects job failures). The modules that implement those rules own them.
