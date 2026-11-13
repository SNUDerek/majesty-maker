# Open questions: decisions (draft)

**Status: SUPERSEDED.** This draft is not the active decision record. The final decisions and implementation tasks are in [open-questions-tasks.md](open-questions-tasks.md), which corrects this draft's Q13 fee/recovery timing and Q5 field naming.

**Inputs:** [thematic design](../thematic-design-doc.md), [suggestions A](open-questions-suggestions-a.md), [suggestions B](open-questions-suggestions-b.md), and the [owner's opinions](open-questions-opinions.md). Where they disagree, gameplay balance and ease of development decide, ahead of the owner's stated preference.

**Scope:** Q1–Q13 from [implementation-tasks.md §5](../implementation-tasks.md#5-open-questions-found-while-planning) and every row of the [unresolved-parameter register](../unresolved-parameters.md).

**Rule vs number:** a decision below settles the *rule*. Numbers marked *experimental* are starting values that the F1–F3 balance batches may still move.

## Summary

| # | Question | Decision | Work needed |
|---|---|---|---|
| Q1 | Tutor burden | Hedge Knight +5 Fatigue; Hermit +5 Melancholy; **Smuggler +3 Fatigue / +2 Melancholy** | config |
| Q2 | Purse Protection on failed Laboratores approaches | **Applies** to encounter failures and wipeouts | config flag |
| Q3 | New Moon skip scope | Once per segment entered in a New Moon week; no rollover | none (already so) |
| Q4 | Waxing | Applies once, never compounds; **×1.20** | config |
| Q5 | Square downside | **×2 Fatigue and Melancholy** on tutor sessions | small engine change |
| Q6 | Full Moon vs Gambeson | Double first, then −5 (25 Fatigue) | none |
| Q7 | Retreat toll payer | Carried Coin, then treasury; retreat is never blocked | none |
| Q8 | Theriac / Wort at waystations | Allowed | none |
| Q9 | Skip payment and progress | Carried Coin only, **10 Coin**; counts toward N; no loot | config |
| Q10 | Saint's Relic | +10 points of success chance vs Oratores threats | doc wording |
| Q11 | Opposition on failed jobs | Applies to success and failure burdens | none |
| Q12 | New Moon / Full Moon home bonus | **+20%** stat gain and payout | config |
| Q13 | Wipeout and home collapse | Wipeout recovers **−35/−35**; home collapse −15/−15 **plus a 20 Coin physician fee** | small engine change |
| R1 | Route and finale | Keep 5×5, finale 8 at −20, as the baseline | none |
| R2 | Waning on Rest at Home | Stays off | none |
| R3 | Retreat losses | Keep 50% loot; **toll 10** | config |
| R4 | Item acquisition | Disabled for the baseline; first-arrival drops later | separate task |
| R5 | Test reward table | Test fixture only | none |

Five decisions depart from one of the inputs in a way worth knowing about:

- **Q5** takes neither suggestion. It uses the owner's "logical" option (double both bars), not the flat +5 Melancholy the owner leaned towards.
- **Q3/Q9** set the skip fee at 10 (B), not 5 (A).
- **R3** raises the retreat toll to 10 (A), not 5 (B).
- **Q13** adds a home-collapse fee that neither suggestion proposed; it comes from the owner.
- **Q1** adopts the 3/2 split despite a balance risk, with a named fallback.

## Q1: Tutor burden mapping

**Decision:** Hedge Knight +5 Fatigue; Hermit +5 Melancholy; Smuggler +3 Fatigue / +2 Melancholy. *Experimental.*

- The design says "+5 condition" for every tutor. The current Smuggler (+5/+5) charges double for the same price and gain.
- The split is the owner's preference and B's proposal. It keeps a little of both bars in the Laboratores identity.
- **Balance risk:** Laboratores specialists already win fastest (median week 45 vs 50) under the *harsher* +5/+5 mapping, and a split burden is the cheapest kind to clear, because Rest at Home removes 15 from both bars. Q2 strengthens the Estate further.
- **Fallback:** if F1 shows the Laboratores lead widening, switch the Smuggler to +5 Melancholy (A's proposal). That concentrates the burden on one bar that Laboratores does nothing to raise.

## Q2: Purse Protection on failed Laboratores encounters

**Decision:** apply it to both failed Laboratores approaches and wipeout losses. Set `failure.purseProtection.appliesToLabFailures: true`.

- All three inputs agree, and the thematic doc says so explicitly.
- It gives Laboratores the defensive value the other two Estates get from their raised ceilings.
- Cost of a failed approach: `floor(15 × (1 − P/100) × itemMultiplier)`, where `P = floor(Laboratores / 2)` and the multiplier is 0.5 with the Weighted Coin. Floor once. At Laboratores 50 that is 11 Coin, or 5 with the Weighted Coin.
- Full Moon does not double Coin costs.
- A wipeout is triggered only when the final cost exceeds carried Coin; paying exactly the cost is survivable.
- The wipeout retention rate stays `stat / 200`. No tweak is proposed until F1 shows a problem.

## Q3: New Moon skip scope

**Decision:** one skip per segment *entered* during a New Moon week, including the finale.

- Lunar effects lock at segment entry, as the engine already does.
- An unused skip does not carry into the next segment. Continuing from a waystation the following week (Waxing) gives no skip.
- Rules text should say "once per New Moon segment", not "per route".

The fee is decided in Q9.

## Q4: Waxing multiplier

**Decision:** a single bonus when the previous week's action was the same named job or tutor. No compounding. Raise `astrology.waxing.bonusPct` from 110 to **120**. *Experimental.*

- Keep `mode: "single"`. Rest, travel, convalescence, or a different activity breaks eligibility.
- It applies to positive stat gains and job payouts only, not to costs, opposing-stat losses, or burdens.
- ×1.10 disappears under floor rounding: a +5 tutor gain stays +5. At ×1.20 it becomes +6, and a 15 Coin payout becomes 18.
- Update the thematic doc, which still says "compounding 1.1x".

## Q5: Square month downside

**Decision:** in a Square month, tutor sessions generate **double Fatigue and double Melancholy** (alongside the existing +30% gain).

| Tutor | Normal | Square |
|---|---|---|
| Hedge Knight | 5 Fatigue | 10 Fatigue |
| Hermit | 5 Melancholy | 10 Melancholy |
| Smuggler | 3 Fatigue / 2 Melancholy | 6 Fatigue / 4 Melancholy |

- The current rule doubles Melancholy only, so the Hedge Knight gets +30% gains for free. B proposed accepting that; it hands Bellatores an uncontested advantage while specialist dominance is already the main balance finding.
- Doubling both bars costs every tutor exactly 10 total burden, so the loophole closes with no special cases.
- It is the cheapest fix. The modifier pipeline already has a Fatigue multiplier (Opposition uses it), so this is one extra line in `src/core/astrology.ts` plus renaming `squareTutorMelancholyPct` to `squareTutorBurdenPct`. A flat +5 Melancholy (A, and the owner's intuition) would need a new additive modifier type.
- The asymmetry the owner wanted survives through Q1: the Smuggler spreads its Square burden over two bars, the others load one.
- Update the thematic doc: "double the normal Melancholy" becomes "double the normal Fatigue and Melancholy".

## Q6: Full Moon and Gambeson order

**Decision:** double the base penalty, then subtract the Gambeson's 5, minimum 0: `max(0, 15 × 2 − 5) = 25` Fatigue. Unanimous; matches the engine.

## Q7: Retreat toll funding

**Decision:** unanimous; matches the engine.

1. Forfeit the configured share of remaining earned loot.
2. Pay the toll from carried Coin, then from the treasury, capped at what is available.
3. Bank what is left of carried Coin.

- Retreat is always legal. A shortfall causes no debt, wipeout, or extra week.
- Coin brought from home is exempt from the loot forfeit but can pay the toll.
- State the forfeit-then-toll order in tech doc §7.

The toll amount is decided in R3.

## Q8: Recovery consumables at waystations

**Decision:** Theriac and St. John's Wort can be used between encounters and at the waystation decision. Neither costs a week. Unanimous; matches the engine.

- Arriving at a waystation does not restock the consumable slot.
- They cannot interrupt a pending failed-roll reaction or undo a wipeout. Metheglin stays limited to the failed-roll window.

## Q9: Skip payment and progress

**Decision:**

- The fee is paid from carried Coin only.
- The fee is **10 Coin** (`astrology.newMoon.skipFee: 10`). *Experimental.*
- A skipped card counts as one of the N encounters. It can complete a segment or win the finale.
- A skip gives no loot, no penalty, and no roll.
- If carried Coin is below the fee, the skip is unavailable. It is not a wipeout and consumes no RNG.

Why 10 and not 5:

- A skip buys certainty on the worst card of a segment, including a finale card at −20. Coin is not scarce for the builds that already win, so a 5 Coin skip mainly helps them.
- After Q2, a failed Laboratores approach costs a trained character about 10 Coin. At 10, the skip is a judgement call for her and still a clear saving against a 15-point Fatigue or Melancholy hit.
- It matches the departure fee and the existing `astrology-full` variant, so no new variant is needed. Sweep 5 against 10 in F1.

UI note for later: the pilgrimage screen should show the number of encounters remaining, and a skip should reduce it.

## Q10: Saint's Relic

**Decision:** +10 percentage points of success chance against an Oratores threat, whatever the approach. Applied after matchup and road modifiers, before the 5–95% clamp. Matches the engine.

- On a 0–100 roll-under scale this is the same as the owner's "−10 to the die"; the probability form fits the existing modifier order.
- Reword the thematic doc from "+10 to roll result" to "+10 to success chance".

## Q11: Opposition and failed jobs

**Decision:** ×1.5 on all job burdens, success or failure, Stables included. Unanimous; matches the engine.

- Resolve the job outcome first, then multiply and floor once. A failed Village Watch costs 15 Fatigue; a failed Alehouse costs 7 and 7.
- Coin and stat gains are unaffected.

## Q12: New Moon and Full Moon home bonuses

**Decision:** **+20%** to stat gains and job payouts. Set `astrology.newMoon.activityBonus: 20` and `astrology.fullMoon.surge: 20`. *Experimental.*

- New Moon: Smuggler and Alehouse. Full Moon: Hedge Knight, Hermit, Village Watch, Scriptorium.
- Burdens, costs, opposing-stat losses, and success chances are unchanged.
- +20% is the smallest round value that survives flooring on a +5 tutor gain. It also matches Waxing, so every lunar bonus reads as "one extra point on a lesson".
- Lunar phases never overlap, so these bonuses cannot stack with each other. They do stack with solar aspects: multiply all factors, then floor once. A Square-month tutor session in a boosted week gives `floor(5 × 1.3 × 1.2) = 7`.
- Each Estate ends up with two boosted tutor weeks a month: New then Waxing for Laboratores, Waxing then Full for the other two.
- With both values set, reports drop the "partial astrology" label.

## Q13: Wipeout recovery and home collapse

**Pilgrimage wipeout:** replace the reset-to-zero with **−35 Fatigue / −35 Melancholy**, the Banquet amount, floored at 0. *Experimental.*

- A full reset is worth two or three weeks of paid rest for the price of one, which makes a wipeout a cheap full heal. The Reckless bot wipes out about 3.5 times a run without being forced to change course.
- At −35, a collapsed character comes home at 40 or more on the maxed bar and has to rest before setting out again.
- The other costs are unchanged: lost loot and carried Coin (less Purse Protection), the 50 Coin medical fee, one convalescence week. Secured waystations are kept.
- Engine: `failure.wipeoutBurdenReset` accepts only `"zero"` and `"unchanged"`. Add a numeric form such as `{ "recovery": 35 }`.

**Home collapse:** the triggering activity spends its week, then one forced convalescence week at −15/−15, **plus a 20 Coin physician fee**. *Experimental.*

- Without a fee, the forced week is identical to choosing Rest at Home, so working until collapse costs nothing. This is the owner's point and it holds.
- 20 Coin makes a collapse strictly worse than a planned Bathhouse or Shrine visit (15 Coin for a better recovery) and stays well under the 50 Coin wipeout fee.
- The fee is capped at the treasury and never creates debt, like the medical fee. Purse Protection does not apply.
- Engine: add `failure.homeCollapse.fee`, charged in the reducer's convalescence step.

All recovery weeks are bounded by the campaign deadline.

## Register entries without a Q number

### R1: Route length and finale

**Decision:** keep 5 regular segments × 5 encounters, an 8-card finale, and a −20 final road bonus as the F1 baseline. All four stay *experimental*.

- These are the main difficulty levers and should not be fixed before data.
- Specialist bots win every run by about week 45–50 of 96. Test the harder finale first (`final-n10`, `final-road-30`); it targets specialists, whereas a longer route costs every policy calendar time.
- Re-run after Q1, Q2, and Q9 are applied, since all three help Laboratores.

### R2: Waning Moon and Rest at Home

**Decision:** keep `astrology.waning.appliesToRestAtHome: false`. Unanimous. The ×1.5 applies to Bathhouse, Shrine, and Banquet only, so free rest does not undercut paid rest.

### R3: Retreat loot retention and toll

**Decision:** keep `failure.retreatLootRetentionPct: 50`; raise `failure.retreatToll` from 5 to **10**. Both *experimental*.

- Earned loot is 1d4 a card, so retention barely matters. The toll carries the real cost.
- At 5 Coin a retreat is nearly free: Reckless retreats about 28 times a run.
- At 10, retreating and setting out again costs 20 Coin, more than one failed Laboratores approach.
- Retention applies to remaining earned loot only, floored: 3 Coin earned keeps 1.

### R4: Item acquisition

**Decision:** keep `items.acquisition: "disabled"` for the baseline.

- `drawItemReward` in `src/core/items.ts` is never called from the pilgrimage flow, so the `items-test-table` variant grants nothing today. Wiring it in is a separate engine task.
- Until then, test item *effects* with starting-inventory overrides on paired seeds, and label those runs as provisioned-item experiments.
- First acquisition rule to try, once wired: one draw on the **first** securing of each regular waystation, at a 25% chance. That is about 1.25 items per full route, cannot be farmed, and fits "rare, endgame items".

### R5: Test reward table

**Decision:** keep equal weights as a test fixture. It implies no production drop rate. If R4's rule is adopted, add a separate production table; a starting point is weight 2 for consumables and 1 for equipment.

## Applying the decisions

Each step is its own branch and PR, per `AGENTS.md`.

1. **Config only** (Q1, Q2, Q4, Q9, Q12, R3): ship as one variant, for example `content/variants/open-questions-decisions.json`, and compare it with the baseline on paired seeds before touching `rules.default.json`.
2. **Small engine changes, with tests:**
   - Q5: Square doubles both tutor burdens.
   - Q13: numeric wipeout recovery and the home-collapse fee.
3. **Docs:**
   - Thematic doc: Waxing wording (Q4), Square wording (Q5), Relic wording (Q10), "once per New Moon segment" (Q3).
   - Tech doc §7: forfeit-then-toll order (Q7).
   - Register: add rows and `provenance` entries for the new and changed fields (`waxing.bonusPct`, `squareTutorBurdenPct`, wipeout recovery, `homeCollapse.fee`), or `config.test.ts` will fail. Fix the stale "§9" reference; the open questions are in §5.
4. **Separate task:** wire item rewards into the pilgrimage flow (R4).

In F1, measure the Q1, Q2, and Q12 changes one at a time before the combined variant, so an effect can be attributed. Watch three things in particular: the Laboratores lead (Q1 + Q2 + Q9), the Reckless retreat-and-wipeout loop (Q13 + R3), and whether the harder finale closes the gap between specialists and balanced play (R1).

*Drafted by Claude Fable 5.2.*
