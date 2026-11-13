# Open questions: Codex suggestions

**Status:** Proposal for discussion; no rules or configuration changes are approved by this document.

**Scope:** All entries in the [unresolved-parameter register](unresolved-parameters.md), including Q1–Q13 in [implementation-tasks.md §5](implementation-tasks.md#5-open-questions-found-while-planning), informed by the [thematic design](thematic-design-doc.md), [technical plan](technical-planning-doc.md), and current engine/configuration. Recommendations below are design judgments, not findings from balance batches.

## Q1 — Tutor burden mapping

**Recommend:** Hedge Knight +5 Fatigue; Hermit +5 Melancholy; Smuggler +3 Fatigue/+2 Melancholy.

Keep the physical/spiritual identities, but give each tutor a total base burden of 5. The current Smuggler assumption (+5/+5) charges twice the total burden for the same price and stat gain, without evidence that Laboratores needs this disadvantage. Splitting the Smuggler's burden represents both physical practice and anxious deception while retaining integer values.

This changes `classes.tutorBurden` only. Compare the existing mapping against this candidate before judging specialist viability; inspect recovery weeks as well as victory rate. Equal total burden does not guarantee equal cost because ceilings and recovery options differ.

## Q2 — Purse Protection on failed Laboratores encounters

**Recommend:** Apply it to ordinary Laboratores failure costs as well as wipeout retention, matching the thematic promise that Laboratores provides financial resilience.

Use the existing configurable hook. Let `P = floor(Laboratores / 2)` percent. Ordinary failure cost is `floor(15 × (1 − P/100) × equipmentMultiplier)`, with the multiplier 0.5 for Weighted Coin and 1 otherwise. Floor once after all factors. At Laboratores 50, the cost is 11 Coin, or 5 with Weighted Coin. Full Moon does not multiply Coin costs.

Check affordability against this final cost; paying exactly the cost is survivable. On financial wipeout, preserve the existing pre-lethal-cost retention rule and separate medical fee. Weighted Coin affects the encounter cost only. This strengthens an Estate already able to buy its way past risk, so compare approach shares, Coin wipeouts, and specialist outcomes with protection on/off before final adoption.

## Q3 — New Moon skip scope

**Recommend:** Once per segment entered during New Moon, including the final gauntlet; reset availability on each new segment entry.

A segment is the unit that consumes a week, so it should also be the unit receiving that week's lunar privilege. “Route” could mean the whole campaign or one departure session, creating confusing limits around returns and retries. Use “once per New Moon segment” consistently in future rules text. Lock lunar effects to segment entry, as the engine already does.

Enable this with Q9's candidate fee for experiments. Confirm that continuing into a non-New-Moon segment removes eligibility, and that no second skip is possible within the same segment.

## Q4 — Waxing multiplier

**Recommend:** One ×1.1 bonus when the immediately preceding week's action was the exact same named job or tutor. No accumulated or banked streak multiplier.

This creates a simple two-week planning incentive without rewarding long repetitive schedules exponentially. A rest, travel, convalescence, or different activity breaks eligibility. Apply the bonus to positive stat gains and job payouts, not tutor costs, opposing-stat losses, or burdens. Retain the existing single-floor modifier pipeline and `mode: 'single'`.

Integer rounding limits its effect: +5 tutor gain remains +5 without another modifier, while a 15-Coin payout becomes 16. Document this limitation and evaluate it before proposing any rounding change.

## Q5 — Square month without a Hedge Knight downside

**Recommend:** Accept this asymmetry for the initial balance evaluation. Square doubles existing tutor-generated Melancholy; it does not create Melancholy when the base amount is zero.

Under Q1, the Hedge Knight remains +5 Fatigue/+0 Melancholy, the Hermit becomes +10 Melancholy, and the Smuggler becomes +3 Fatigue/+4 Melancholy. The Knight therefore receives a favorable training window. Different schedules by Estate can make the calendar interesting, and equal penalties are not required for every activity.

Treat this as a hypothesis to test. Compare Bellatores specialists and training weeks during Square; if the advantage is excessive, propose a separate tutor-burden or Square-rule revision. Do not silently add a minimum Melancholy penalty while resolving Q1.

## Q6 — Full Moon and Gambeson order

**Recommend:** Multiply the base burden for Full Moon, then subtract Gambeson's flat reduction, with a minimum of zero: `max(0, 15 × 2 − 5) = 25 Fatigue`.

Gambeson absorbs a fixed amount of the resulting damage. Subtracting first would implicitly double its protection on Full Moon. Keep the current order and test ordinary versus Full Moon failures with and without equipment.

## Q7 — Retreat toll funding and shortfall

**Recommend:** Keep carried Coin first, then treasury, capped by available funds. Retreat must remain legal when the full toll cannot be paid; no debt, wipeout, or extra week for a shortfall.

First forfeit the configured portion of remaining earned loot, then collect the toll, then bank the remaining carried balance. Coin brought from home is exempt from loot forfeiture but can pay the toll. For example, a 5-Coin toll with 2 carried and 10 in treasury takes 2 carried plus 3 treasury; with 2 carried and no treasury it takes only 2.

Retreat is the safety valve for an already costly failed segment. Blocking it would turn a voluntary escape decision into an unavoidable collapse. Keep the existing 5-Coin toll and 50% loot retention experimental; measure cheap retreat/retry loops before changing either magnitude.

## Q8 — Recovery consumables at waystations

**Recommend:** Allow Theriac and Wort both between encounters and at the waystation decision, before returning or entering another segment. Neither consumes a week.

A waystation is a natural place to recover and decide whether to push on. The carried one-consumable limit still applies; arrival does not replenish inventory or permit free restocking. Do not allow recovery consumables to interrupt a pending failed-roll reaction or reverse a committed wipeout. Metheglin remains exclusive to the failed-roll reaction window.

## Q9 — Skip payment and progress

**Recommend:** Pay from carried Coin; the skipped card counts toward the segment's encounter requirement. It gives no success loot, no failure penalty, and no success/failure roll. A final-card skip may complete a checkpoint or win the finale.

Use **10 Coin** as the initial experimental fee, matching the existing `astrology-full` variant. Require sufficient carried funds; an unaffordable attempt is rejected without mutation or RNG consumption, rather than triggering financial wipeout. Keep skips separate from successful rolls in metrics.

Ten Coin buys certainty at a visible opportunity cost. Compare skip use, final-card wins, carried-funds shortages, and progression against skipping disabled before confirming the price.

## Q10 — Saint's Relic

**Recommend:** +10 percentage points to success probability against an Oratores threat, regardless of chosen approach. Apply it after matchup/road modifiers and before the 5–95% clamp.

Adding 10 to a roll-under die result would make a protective relic harmful. Preserve the current helpful interpretation and describe it as “+10 percentage points to success chance,” avoiding “bonus to roll.” A probability of 60 becomes 70; 90 becomes 95 after clamping.

## Q11 — Opposition and failed jobs

**Recommend:** Apply ×1.5 to all job-generated burdens, whether the job succeeds or fails, including Stables. Resolve the job outcome first, then multiply each resulting burden magnitude and floor once.

Opposition describes a difficult working month, not an extra penalty conditional on success. A failed Village Watch produces 15 Fatigue instead of 10; a failed Alehouse produces 7 Fatigue and 7 Melancholy instead of 5 each. Do not multiply the failure penalty twice merely because the failure is already harsher. Coin and stat gains are unaffected by Opposition.

## Q12 — Full Moon surge and New Moon home bonus

**Recommend:** Experiment with **+20%** positive stat gains and job payouts for the eligible activities. Keep burdens, costs, opposing-stat losses, and success probabilities unchanged.

New Moon applies to Smuggler/Alehouse; Full Moon applies to Hedge Knight, Hermit, Village Watch, and Scriptorium. This is a candidate magnitude, not a confirmed balance value. With floor rounding, +10% alone leaves a base +5 tutor gain at +5 and a +2 job gain at +2. At +20%, tutoring visibly improves to +6; job growth still rounds to +2, but a fixed 15-Coin payout becomes 18. That is a useful first test of whether lunar timing changes decisions.

The existing `astrology-full` variant uses +10%, not this recommendation. Preserve it as a comparison: evaluate off, +10%, and +20% with the skip setting held constant, then test skipping separately. Do not combine all changes and attribute the result to home bonuses. Multiply applicable solar/lunar factors before flooring once; do not round each bonus independently. Keep off runs labeled partial astrology and enabled values marked experimental until approved.

## Q13 — Wipeout recovery and home collapse

**Recommend:** Keep the current distinction:

- **Pilgrimage wipeout:** reset both burdens to zero and consume one extra convalescence week when time remains, alongside the existing financial/item losses. Preserve secured checkpoints.
- **Home collapse:** the triggering activity spends its normal week, then force the next available week of convalescence, reducing both burdens by 15, floored at zero. No medical bill or pilgrimage loss. If still collapsed, require further recovery before normal actions resume.

Wipeout already costs money, provisional progress, and time. Resetting burdens prevents an additional recovery spiral, but may encourage intentional wipeouts as a full heal. Home collapse should remain a smaller consequence tied to ordinary rest, so planned rest remains useful. Keep both behaviors explicit in reports.

Bound all recovery weeks by the campaign deadline; never grant another playable week. Inspect repeated intentional wipeouts, treasury-empty campaigns, and home-collapse cycles before confirming these choices.

## Additional entries in the unresolved-parameter register

The register distinguishes **tbd** rule decisions from **experimental** numeric candidates. Retaining a current default below does not confirm it. Approval of an interpretation can settle a rule decision while its numerical tuning remains experimental.

### Route length and final difficulty

**Recommend:** Retain 5 regular segments, 5 encounters per regular segment, 8 final encounters, and a −20 final road bonus as the reference configuration. These cover `route.regularSegments`, `route.encountersPerSegment`, `route.finalEncounters`, and `route.finalRoadBonus`; all four remain experimental.

This gives 25 regular encounters plus 8 final encounters on an uninterrupted successful route. The minimum travel cost is 6 weeks, one per segment including the finale, rather than 33 weeks. Whether the challenge feels appropriate depends on preparation and failed attempts; encounter totals alone cannot establish balance.

Use the existing 4/5/6-segment, 6/8/10-final-encounter, and −10/−20/−30-final-road variants for separate sensitivity comparisons. Hold the regular road curve policy consistent when comparing route lengths and record the actual arrays. Regular encounters per segment has no named sweep in E6; propose a separate 3/5/7 comparison if baseline traces suggest segments are too easy or too punishing. That comparison would require new experiment configuration, not a change to the reference default. Inspect checkpoint progression and attempts per checkpoint alongside victories so final difficulty is distinguishable from failure to reach the finale.

### Waning Moon and free rest

**Recommend:** Retain `astrology.waning.appliesToRestAtHome: false`. Apply ×1.5 recovery only to Bathhouse, Shrine, and Banquet, as explicitly listed in the source.

This gives paid recovery a distinct scheduling advantage while free rest remains a reliable −15/−15 fallback. If free rest also received the multiplier, both reductions would become 22 after flooring, potentially reducing the value of purchased rest. Test that alternative separately if paid rest is rarely selected. The scope decision remains tbd pending approval; do not infer approval from retaining `false`.

### Retreat loss magnitudes

**Recommend:** Retain `failure.retreatLootRetentionPct: 50` and `failure.retreatToll: 5` as experimental, alongside Q7's accounting recommendation. Retention means keeping half of the *remaining earned loot*, not keeping half of all carried Coin; the toll is an additional charge.

Floor the retained amount before deriving the forfeiture: 3 remaining earned Coin yields 1 retained and 2 forfeited. Inspect repeated retreats, forfeited loot, actual toll paid, and recovery time before adjusting either value. Test retention and toll independently if retreat is either effectively free or so expensive that bots never use it. Q7 settles the payer and shortfall behavior only; it does not confirm these magnitudes.

### Item acquisition and the test reward table

**Recommend:** Retain `items.acquisition: 'disabled'` for the item-free baseline. Keep equal weights of 1 for all six entries in `items.testRewardTable` as a test fixture, with experimental provenance. Neither setting establishes a production drop rate or item rarity.

The table specifies which item an explicit reward call chooses, not how often or when campaigns award one. In the current engine, `drawItemReward` exists in `src/core/items.ts`, but pilgrimage rewards only draw Coin and do not call it. Selecting `items-test-table` alone therefore does not demonstrate item acquisition during a campaign. Treat that as an experiment limitation to report, not evidence that items have no effect.

For Phase 0 item-effect comparisons, use documented starting-inventory overrides and the same seed sets, recording the exact supplies given to each policy. Label these as provisioned-item experiments; they test item effects and policy use, not acquisition balance. The existing one-equipment/one-consumable carry restrictions still apply.

If natural acquisition is required for F3, propose a separate rule and implementation task first. My preferred initial experiment is one uniformly drawn inventory item on the **first** securing of each regular waystation, with no grants on repeat visits and no immediate resupply of carried slots. This bounds rewards and avoids checkpoint farming. Five guaranteed grants per completed regular route may be too generous for the intended rarity, so compare it with item-free and provisioned-item runs before proposing a rarer drop probability. Reward timing, grant probability, safe ownership, and inventory events need explicit decisions and tests; the table alone cannot encode them. This is a new experimental proposal, not existing engine behavior or a confirmed acquisition rule.

### Register coverage and documentation follow-up

Every register entry now has a recommendation here:

| Register path | Recommendation location |
|---|---|
| `route.regularSegments`, `route.encountersPerSegment`, `route.finalEncounters`, `route.finalRoadBonus` | Route length and final difficulty |
| `classes.tutorBurden` | Q1 and Q5 |
| `astrology.newMoon.activityBonus`, `astrology.fullMoon.surge` | Q12 |
| `astrology.newMoon.skipFee` | Q3 and Q9 |
| `astrology.waxing.mode` | Q4 |
| `astrology.waning.appliesToRestAtHome` | Waning Moon and free rest |
| `failure.retreatLootRetentionPct`, `failure.retreatToll` | Q7 and retreat loss magnitudes |
| `failure.wipeoutBurdenReset`, `failure.homeCollapse` | Q13 |
| `failure.purseProtection.appliesToLabFailures` | Q2 |
| `items.acquisition`, `items.testRewardTable` | Item acquisition and the test reward table |

Q6, Q8, Q10, and Q11 concern module-owned rule logic and remain covered above despite having no individual register row. The register's closing reference to implementation-task “§9” is stale: the current open-question section is §5. In a subsequent documentation update, correct that reference and clarify that absence from the parameter table does not approve the explicitly unresolved module-owned questions. This proposal leaves the register itself unchanged.

## How to use these recommendations before F3

1. Agree on rule interpretations first: Q3–Q11, Q13, and Waning recovery scope specify timing, eligibility, accounting, and modifier semantics. Decide whether natural item acquisition is required for the evaluation. Approval should be recorded explicitly; this proposal alone does not resolve their status.
2. Run the existing baseline unchanged. Compare Q1's mapping, Q2's protection toggle, and Q12's candidate bonuses independently on paired seeds across the seven policies and twelve signs. Then evaluate the combined candidate and interactions, particularly Laboratores protection plus skipping.
3. Use victory uncertainty intervals, checkpoint reach, recovery weeks, approach shares, resource loops, and representative traces. Stables-only is an economy/control policy; its lack of victories is expected. Check that conclusions are robust to reasonable policy thresholds rather than treating bot performance as proof of optimal play.
4. Evaluate route/finale sensitivity and item effects separately using the experiments above. In a separately authorized implementation, update relevant configs, provenance, source docs, and regression tests for accepted decisions. Record remaining experimental values and item-acquisition limitations in F3 and distinguish config changes from any new rule logic.

All thirteen questions and all seventeen register entries are addressed as proposals. None of their statuses changes merely because this document recommends retaining or replacing a default; final balance conclusions must identify which decisions were approved and which values remain experimental.
