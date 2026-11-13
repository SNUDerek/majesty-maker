# Open questions: Codex suggestions

**Status:** Proposal for discussion; no rules or configuration changes are approved by this document.

**Scope:** Q1–Q13 in [implementation-tasks.md §5](implementation-tasks.md#5-open-questions-found-while-planning), informed by the [thematic design](thematic-design-doc.md), [technical plan](technical-planning-doc.md), [unresolved-parameter register](unresolved-parameters.md), and current engine/configuration. Recommendations below are design judgments, not findings from balance batches.

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

## How to use these recommendations before F3

1. Agree on rule interpretations first: Q3–Q11 and Q13 specify timing, eligibility, accounting, and modifier semantics. Approval should be recorded explicitly; this proposal alone does not resolve their status.
2. Run the existing baseline unchanged. Compare Q1's mapping, Q2's protection toggle, and Q12's candidate bonuses independently on paired seeds across the seven policies and twelve signs. Then evaluate the combined candidate and interactions, particularly Laboratores protection plus skipping.
3. Use victory uncertainty intervals, checkpoint reach, recovery weeks, approach shares, resource loops, and representative traces. Stables-only is an economy/control policy; its lack of victories is expected. Check that conclusions are robust to reasonable policy thresholds rather than treating bot performance as proof of optimal play.
4. In a separately authorized implementation, update relevant configs, provenance, source docs, and regression tests for accepted decisions. Record remaining experimental values in F3 and distinguish config changes from any new rule logic.

Other unresolved parameters, including item acquisition and Waning recovery at home, remain outside these thirteen questions. This proposal does not settle them or claim the full ruleset is ready for final balance conclusions.
