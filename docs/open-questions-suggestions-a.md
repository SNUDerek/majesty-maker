# Open Questions: Suggested Resolutions

**Scope:** proposed answers to Q1–Q13 in [implementation-tasks.md §5](implementation-tasks.md#5-open-questions-found-while-planning), plus the entries in [unresolved-parameters.md](unresolved-parameters.md) that have no Q number (see [Other register entries](#other-register-entries-r1r5)).
**Status:** proposal only. Nothing here is approved, and no config or code has been changed. Any accepted answer should be applied as a config change, or as an explicitly approved rule change, before F3 draws conclusions.
**Basis:** [thematic-design-doc.md](thematic-design-doc.md), [technical-planning-doc.md](technical-planning-doc.md), the current engine (`src/core/`), `content/rules.default.json`, and the post-E3 bot batch (100 runs × 12 signs on default rules).

## Summary

| # | Question | Current default | Proposal | Change? |
|---|---|---|---|---|
| Q1 | Tutor burden mapping | HK +5F, Hermit +5M, Smuggler +5F/+5M | HK +5F, Hermit +5M, **Smuggler +5M** | config |
| Q2 | Purse Protection on Lab encounter failures | Wipeout only | **Apply to both** | config flag |
| Q3 | New Moon skip per route or per segment | Per segment, off | Per segment; **enable with fee 5** | config |
| Q4 | Waxing: compounding or once | Once, ×1.10 | Keep once; **raise to ×1.20** (×1.10 is a no-op on tutor gains) | config |
| Q5 | Square + Hermit-less Melancholy loophole | As configured | Square adds **flat +5 Melancholy** to every tutor | rule (small) |
| Q6 | Full Moon ×2 vs Gambeson −5 order | Double, then −5 | Keep | none |
| Q7 | Who pays the retreat toll | Carried, then treasury, floor 0 | Keep; retreat is never blocked | none |
| Q8 | Theriac/Wort at a waystation | Allowed | Keep | none |
| Q9 | Skip fee source; does a skip count toward N | Carried; counts | Keep; a skip earns no loot | none |
| Q10 | Saint's Relic direction | +10 probability | Keep | none |
| Q11 | Opposition on job failure burdens | Yes | Keep | none |
| Q12 | New Moon / Full Moon home values | 0 (off) | **+20% each** (gain and payout) | config |
| Q13 | Post-wipeout recovery; home collapse | Reset to 0; forced week −15/−15 | **Wipeout recovers −35/−35**; keep home collapse | config (needs new value) |
| R1 | Route length and finale (`route.*`) | 5 segments × 5; finale 8 at −20 | Keep for F1; test a **harder finale** first | none yet |
| R2 | Waning on Rest at Home | Off | Keep off | none |
| R3 | Retreat loot retention and toll | 50%, 5 Coin | Keep 50%; **toll 10** | config |
| R4 | Item acquisition | Disabled | Keep disabled for baseline; **wire the reward hook**, then test rare first-arrival drops | engine + config |
| R5 | Test reward table | Equal weights | Keep as a test fixture only | none |

Seven of the Q-numbered questions keep their current default. The changes cluster around three themes:

1. Integer flooring silently cancels small multipliers.
2. Two Estates have defensive value that the Laboratores stat lacks.
3. Wipeouts are currently cheaper than intended.

---

## Q1: Tutor burden mapping

**Proposal:**
- Hedge Knight: +5 Fatigue.
- Hermit: +5 Melancholy.
- Smuggler: +5 Melancholy (instead of +5/+5).

**Reasoning:**
- The thematic doc says "+5 condition" (singular) for every tutor. The current default gives the Smuggler 10 total burden against 5 for the others, which taxes the Laboratores Estate for no stated reason.
- Laboratores has no natural burden: on the road it pays in Coin. So pick the one that balances the Estate's other activity. The Alehouse adds Fatigue on success, so a Smuggler that adds Melancholy spreads a Laboratores build across both bars, the same way a Bellatores build mixes Watch and Hedge Knight Fatigue with occasional rest.
- Thematically, lockpicking and haggling lessons with a rogue read as nerve-wracking (Melancholy) more than physically exhausting.

**Check in F1:** Laboratores specialists already win fastest (median week 45 vs 50), so lowering the Smuggler's burden may widen that gap. Run it as a variant first and compare against Q2, which also helps Laboratores.

## Q2: Purse Protection on failed Laboratores encounters

**Proposal:** apply it to both (`failure.purseProtection.appliesToLabFailures: true`).

**Reasoning:**
- The thematic doc is explicit: Purse Protection "reduces money lost to failed Laboratores approaches **and** Pilgrimage wipeouts". The tech doc does not contradict this; it calls Purse Protection a "design hook, not yet fully defined".
- Bellatores raises the Fatigue ceiling and Oratores raises the Melancholy ceiling, so each Estate makes its own approach's failures more survivable. Without this flag, Laboratores gives no protection to its own approach. Turning it on restores the symmetry the stat block implies.
- The magnitude is modest: at Laboratores 60, protection is 30%, so a 15-Coin failure costs 10 (`floor(15 × 0.70)`). It stacks multiplicatively with the Weighted Coin, floored once, as `encounter.ts` already does: at Lab 60 with the Coin, 15 × 0.5 × 0.7 = 5.

**Caveat:** this strengthens a build that already wins 100% of the time. Evaluate it together with the specialist-dominance finding in F2, not on its own.

## Q3: New Moon skip, once per route or once per segment

**Proposal:**
- Once per **segment** (the current implementation).
- Enable it with `astrology.newMoon.skipFee: 5`, paid from carried Coin.

**Reasoning:**
- Lunar phase is locked at segment entry and a segment takes one week. So "per segment" already means "only in segments entered during a New Moon week", which is about one week in four. A per-route limit would almost never trigger twice anyway, and it would need extra state that survives across waystations.
- On fee size, 5 Coin is:
  - more than the expected success loot (1d4, mean 2.5), so skipping a card you would probably pass is a bad trade;
  - less than a failed Laboratores penalty (15), so bribing past a card you are likely to fail is attractive.

  That is the push-your-luck decision the thematic doc describes.
- Suggested variants: `skipFee` 3 / 5 / 10.

## Q4: Waxing, compounding or once

**Proposal:**
- Keep `mode: "single"`, as the later tech doc specifies.
- Raise `waxing.bonusPct` from 110 to **120**.

**Key finding:** under the integer-floor rule, ×1.10 does nothing to most home gains:

| Gain | Base | ×1.10 | ×1.20 |
|---|---:|---:|---:|
| Tutor stat | 5 | **5** | 6 |
| Job stat (Watch, Scriptorium, Alehouse) | 2 | **2** | 2 |
| Stables Coin | 6 | **6** | 7 |
| Watch/Scriptorium Coin | 15 | 16 | 18 |

At ×1.10 the only visible effect is +1 Coin on two jobs. ×1.20 makes "repeat the same class into week 2" a real choice. Compounding would make the bonus grow with unbounded streaks of the same activity, which rewards monotony. That conflicts with the balanced play the game wants and makes specialist dominance worse.

## Q5: Square month with a Melancholy-free tutor

**Proposal:** redefine Square's downside as "each tutor session adds an **extra +5 Melancholy**" instead of "tutor Melancholy ×2".

**Reasoning:**
- The thematic intent is "double the normal [burden] … representing the immense pressure of rapid development". Pressure applies to every tutor, but ×2 of zero is zero, so under Q1 the Hedge Knight gets +30% gains in Square months for free.
- The flat version gives:
  - Hedge Knight: +5F +5M.
  - Hermit: +10M (identical to today's ×2).
  - Smuggler: +10M under the Q1 proposal (identical to ×2).

  So it only closes the loophole.
- **This is a small rule-logic change**, not a config tweak: it needs a new field such as `solar.squareTutorExtraMelancholy`. If config-only changes are preferred, the fallback is to give the Hedge Knight a token +1 Melancholy, but that is less clean.

## Q6: Order of Full Moon ×2 and Gambeson −5

**Proposal:** keep the current order: double, then subtract 5 (15 → 30 → 25).

**Reasoning:**
- This matches the probability rule in tech §7: multipliers first, then flat item adjustments. It treats the Gambeson as armour that absorbs a fixed amount of whatever the blow deals.
- Full Moon is meant to be the dangerous week ("high-risk, high-reward"). Reducing first would make the Gambeson twice as valuable in exactly the week it should matter least.
- The difference is only 5 points either way.

## Q7: Who pays the retreat toll

**Proposal:** keep the current rule:
1. The loot forfeit is applied first.
2. The toll is paid from carried Coin, then from the treasury, floored at 0.
3. Retreat is never blocked by an inability to pay.

**Reasoning:** the thematic doc frames the toll as being paid on the spot (bribes, bartering goods), so carried Coin is the natural source. Falling back to the treasury models settling the debt on return. Never blocking retreat matters: if retreat were refused for lack of funds, a cautious player would be pushed into a wipeout, which punishes the safer choice.

**Doc fix:** state the forfeit-then-toll order explicitly in tech §7 so it is not just an implementation detail.

## Q8: Theriac and Wort at a waystation

**Proposal:** keep "both": usable between encounters and at a waystation.

**Reasoning:**
- The waystation is still part of the pilgrimage, and the thematic doc only restricts consumables to pilgrimages.
- Using a consumable before continuing is the most natural moment: you have arrived safely and are deciding whether to push on.
- Forbidding it would only force a pointless "continue, then use before the first card" step that achieves the same result.

## Q9: Skip-fee source and whether a skip counts toward N

**Proposal:** keep both defaults:
- The fee is paid from carried Coin. You are on the road and the treasury is at home.
- A skipped card counts as one of the N encounters.

Also confirm that a skip:
- earns **no** 1d4 loot;
- is unavailable, not a wipeout, when carried Coin is below the fee.

Both are already implemented.

**Reasoning:** "Bribe/sneak past one encounter card" means the card is behind you. If a skip did not count toward N, it would be a fee for nothing.

## Q10: Saint's Relic, +10 probability or +10 to the die

**Proposal:** keep +10 **success probability** against Oratores threats.

**Reasoning:** the item is listed as a buff. Under roll-under, adding +10 to the die would make it a curse. The thematic wording ("+10 to roll result") was written without the roll-under convention in mind. Update the thematic doc wording to "+10 to success chance" to remove the ambiguity.

## Q11: Opposition on job failure burdens

**Proposal:** keep "yes, success and failure burdens alike".

**Reasoning:**
- "All Jobs generate 1.5x Fatigue and Melancholy" makes no distinction, and failure burdens are the bigger job burdens.
- Excluding them would make Opposition gentler for players who fail more often, which is backwards for a "maximum friction" month.
- Example: a failed Watch shift costs `floor(10 × 1.5) = 15` Fatigue in Opposition.

## Q12: New Moon bonus and Full Moon surge for home activities

**Proposal:**
- `astrology.newMoon.activityBonus: 20` for the Smuggler and Alehouse.
- `astrology.fullMoon.surge: 20` for Bellatores and Oratores activities.

Both apply to stat gain and Coin payout, as the engine already does.

**Reasoning:**
- +20% is the smallest round value that survives flooring on a +5 tutor gain (5 → 6), for the same reason as in Q4.
- One shared magnitude keeps the moon readable: Waxing, New and Full each give "one extra point on a lesson".
- The cycle stays balanced:

  | Phase | Activities boosted | Pilgrimage effect |
  |---|---|---|
  | New Moon | 2 (Laboratores) | Skip option |
  | Full Moon | 4 (Bellatores and Oratores) | Double penalties: dangerous week for the road |

- Once these values are set, the "partial astrology" label in E5 reports goes away. Run the `astrology-full` variant to compare.

## Q13: Post-wipeout recovery and home collapse

**Proposal:**
- **Wipeout:** replace the reset-to-zero with a fixed recovery of **−35 Fatigue / −35 Melancholy**, the Banquet amount, applied during the convalescence week.
- **Home collapse:** keep the forced week with −15/−15.

**Reasoning for the wipeout change:**
- Resetting to 0 is worth two to three weeks of paid rest. Combined with losing only one week, that makes a wipeout a cheap full heal.
- Reckless averages about 3.5 wipeouts and 28 retreats per run, and burden reset is a plausible reason the spiral never punishes it enough to change course.
- −35/−35 leaves a collapsed character, sitting at a ceiling of 75 or more, at about 40 or higher. She must then rest before setting out again, which is the "bed rest" the thematic doc describes.
- Financial wipeouts (low burdens) are unaffected, because recovery floors at 0.
- **Engine note:** `failure.wipeoutBurdenReset` currently allows only `"zero"` and `"unchanged"`. This needs a numeric option, such as `{ recovery: 35 }`, which is a small engine change.

**Reasoning for keeping home collapse:** the thematic doc says the player "must immediately rest to recover", and Rest-at-Home values make that rule simple to explain. It also leaves room for the future Physician and disease system to replace it.

---

## Other register entries (R1–R5)

`docs/unresolved-parameters.md` lists several unconfirmed values that have no Q number. They are labelled R1–R5 here. Each register entry with a Q number is covered above:

| Register path | Covered by |
|---|---|
| `classes.tutorBurden` | Q1, Q5 |
| `astrology.newMoon.activityBonus`, `astrology.fullMoon.surge` | Q12 |
| `astrology.newMoon.skipFee` | Q3, Q9 |
| `astrology.waxing.mode` | Q4 (`waxing.bonusPct` is not in the register, but Q4 proposes changing it) |
| `failure.retreatToll` (who pays) | Q7 (the amount is R3) |
| `failure.wipeoutBurdenReset`, `failure.homeCollapse` | Q13 |
| `failure.purseProtection.appliesToLabFailures` | Q2 |

**Register updates if the proposals are accepted:**
- Q5 and Q13 add new fields (for example `solar.squareTutorExtraMelancholy` and a numeric wipeout recovery). These need register rows and `provenance` entries, or `config.test.ts` will fail.
- Q4 changes `waxing.bonusPct`, so add it to the register while it is unconfirmed.

### R1: Route length and finale

Paths: `route.regularSegments`, `encountersPerSegment`, `finalEncounters`, `finalRoadBonus`.

**Proposal:**
- Keep the current values (5 segments × 5 encounters; an 8-card finale at −20) as the F1 baseline.
- Do not settle these before F1. They are the main difficulty levers, and E6 already provides variants for them.

**Reasoning and what to test first:**
- Specialist bots currently win every run by about week 45–50 of 96. Pragmatic wins 52% of the time, at a median of week 90.
- The gap suggests the finale is beatable by a single maxed stat.
- Raising the finale's difficulty targets specialists more than balanced play. A longer route mainly costs calendar time, which hurts every policy.
- So test `final-n10` and `final-road-30` before the route-length variants (`route-4/5/6`).
- Re-check this after Q1/Q2, since both strengthen Laboratores.

### R2: Waning on Rest at Home

Path: `astrology.waning.appliesToRestAtHome`.

**Proposal:** keep `false`.

**Reasoning:**
- The source names only the three paid rests.
- Rest at Home is the free fallback when the treasury is empty. ×1.5 would raise it from 15 to 22 at no cost, which weakens the Coin pressure that gives the paid rests their value.

### R3: Retreat loot retention and toll

Paths: `failure.retreatLootRetentionPct`, `failure.retreatToll`.

**Proposal:**
- Keep retention at 50%.
- Raise the toll from 5 to **10**, equal to the departure fee.

**Reasoning:**
- Earned loot is only 1d4 per won encounter, so retention barely matters: at most about 10 Coin is at stake per segment.
- The toll carries the real cost of retreating. At 5 Coin, retreating is close to free: Reckless averages about 28 retreats per run.
- At 10 Coin, retreating and setting out again costs 20 Coin, more than one failed Laboratores encounter (15). Retreat stays the safe choice but is no longer a free reset.
- Test this as a variant alongside Q13, since both target the Reckless retreat-and-wipeout loop.

### R4: Item acquisition

Path: `items.acquisition`.

**Proposal:**
- Keep `"disabled"` for the F1 baseline.
- For the first items experiment, give one draw from the reward table the **first time** each regular waystation is reached, with a 25% chance. That is about 1.25 items over a full route.

**Reasoning:**
- The thematic doc calls items "rare, endgame items".
- Tying drops to first arrivals means they can't be farmed by replaying a segment, and they don't consume RNG on every encounter.

**Engine gap:** `drawItemReward` (`src/core/items.ts`) is not called anywhere in `src/core`. So even `acquisition: "test_table"` grants no items in real campaigns; items only appear through scenario overrides. Wiring the reward call into the pilgrimage flow is an engine task, needed before any items variant means anything.

### R5: Test reward table

Path: `items.testRewardTable`.

**Proposal:**
- Keep equal weights, as a test fixture only.
- If R4 is adopted, add a separate production table rather than reusing this one. A suggested starting weight is 2 for consumables and 1 for equipment, so the passive equipment stays rarer than one-shot items.

---

## Suggested next steps

1. Approve or reject each row of the summary table.
2. Apply the config-only items (Q1, Q2, Q3, Q4, Q12, and R3) as a named variant first, such as `content/variants/open-questions-proposal.json`. Then compare it against the baseline in F1 before changing `rules.default.json`.
3. Schedule the small rule and engine changes as a separate `fix/` task with tests:
   - Square's flat Melancholy (Q5).
   - Numeric wipeout recovery (Q13).
   - Wiring item rewards into the pilgrimage (R4).
4. In F1/F2, test the harder-finale variants (R1) against the specialist-dominance finding.
5. Separately, note that `docs/unresolved-parameters.md` says the open questions are numbered "as in implementation-tasks.md §9"; they are in §5.

*Proposed by Claude Opus 5.5.*
