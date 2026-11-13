# Open questions: final decisions and implementation tasks

**Status:** Final rule decisions. T1–T7 implemented on `feature/open-questions-impl` (archiving happens at review); T8 remains a separate follow-up PR. Numeric balance values explicitly marked experimental remain tunable through F1–F3. This document supersedes the recommendations in the draft and suggestions; it does not claim that the engine already implements them.

**Basis:** [thematic design](thematic-design-doc.md), `open-questions-suggestions-a.md`, `open-questions-suggestions-b.md`, and [decision draft](open-questions-decisions-draft.md). The owner's opinions referenced by the draft were also consulted. Suggestions A/B and the opinions were read from the main working checkout, where they are currently untracked; this planning commit does not stage those files or their pending renames.

**Scope:** Q1–Q13 in [implementation tasks §5](implementation-tasks.md#5-open-questions-found-while-planning), plus all entries in the [parameter register](unresolved-parameters.md). Keep the medieval scheduling and push-your-luck PoC, the 96-week campaign, and the simplified finale. Social mechanics, disease systems, richer endings, and UI implementation remain outside this work.

## Final decisions

Adopt the draft's gameplay choices. They give every tutor a base burden of five, make lunar lesson bonuses visible after rounding, give every Estate its intended defense, and make collapse costlier than planned recovery. These are design judgments. The earlier specialist win rates and Reckless behavior quoted in suggestion A and the draft have not been reproduced for this plan and must not be treated as evidence that the new rules are balanced.

| ID | Final rule and selected starting value | Delivery |
| --- | --- | --- |
| Q1 | Hedge Knight +5 Fatigue; Hermit +5 Melancholy; Smuggler +3 Fatigue/+2 Melancholy. Magnitudes/split experimental. | T1 |
| Q2 | Purse Protection applies to failed Laboratores encounters and wipeout retention. | T1, T4 |
| Q3 | One skip per segment entered during New Moon, including the finale. Moon locks at entry; no unused-skip rollover. | T4 |
| Q4 | Waxing gives one ×1.20 bonus for repeating the immediately preceding week's exact named job/tutor. No compounding. Magnitude experimental. | T1, T4 |
| Q5 | Square doubles both tutor burdens, retaining +30% stat gain. This replaces doubling Melancholy alone. | T2 |
| Q6 | Full Moon doubles the base Fatigue/Melancholy penalty before flat equipment reductions. Gambeson: 15 × 2 − 5 = 25 Fatigue. | T4 |
| Q7 | Retreat forfeits loot first, pays from carried Coin then treasury, and banks the remainder. Insufficient funds never block retreat or create debt. | T4 |
| Q8 | Theriac/Wort work between encounters and at waystation decisions, without spending time. No restocking or use during a pending failed-roll reaction. | T4 |
| Q9 | Skip costs 10 carried Coin, counts toward N, and gives no loot or roll. Unaffordable skips are unavailable. Fee experimental. | T1, T4 |
| Q10 | Saint's Relic adds 10 percentage points of success chance against Oratores threats, for any approach, before the probability clamp. | T4, T5 |
| Q11 | Opposition multiplies success and failure job burdens by 1.5, including Stables; floor each resulting magnitude once. | T4 |
| Q12 | New Moon: +20% positive gains/payouts for Smuggler/Alehouse. Full Moon: +20% for Hedge Knight/Hermit/Watch/Scriptorium. Magnitudes experimental. | T1, T4 |
| Q13 | Wipeout: one recovery week at −35/−35, with existing losses and up-to-50-Coin medical fee. Home collapse: one forced week at −15/−15 plus an up-to-20-Coin physician fee. Recovery/fee magnitudes experimental. | T3 |
| R1 | Keep five regular segments of five encounters, eight finale encounters, road bonuses +40 → 0 across regular segments and −20 in the finale. Difficulty values experimental. | T6 |
| R2 | Waning's ×1.5 recovery applies only to paid rests, not Rest at Home or forced convalescence. | T4 |
| R3 | Retreat retains 50% of remaining earned loot, floored, and charges a 10-Coin toll. Both experimental. | T1, T4 |
| R4 | Keep acquisition disabled for the baseline. Implement a separate opt-in first-waystation reward experiment after the baseline work. | T8 |
| R5 | Equal-weight test rewards remain fixtures. Use a separate production-experiment table for T8. | T8 |

### Details that implementations must preserve

- **Q1/Q5:** Normal burdens are 5/0, 0/5, 3/2; Square burdens are 10/0, 0/10, 6/4. Choose doubling both bars over an added +5 Melancholy because it closes the cost-free Knight window using the existing multiplier pipeline. Split burdens can still favor Laboratores through free recovery; measure that rather than assuming equal totals imply equal difficulty. Do not automatically switch the Smuggler to +5 Melancholy after a poor batch; record any proposed revision with evidence.
- **Q2:** Preserve the engine's integer-percent convention: `P = floor(Laboratores / 2)` and encounter cost `floor(15 × (1 − P/100) × equipmentMultiplier)`. Weighted Coin supplies 0.5; otherwise use 1. Floor the final product once. At Laboratores 50 the cost is 11, or 5 with the item. Full Moon does not double Coin losses. Exactly enough carried Coin is survivable. Wipeout retains `floor(pre-lethal-cost carried Coin × P/100)` before banking and charging medical costs; Weighted Coin does not affect retention. Document this convention explicitly rather than claiming an unrounded `stat/200` rate is identical at odd stats.
- **Q4/Q12:** Bonuses affect positive stat gains and job payouts only. Costs, opposing-stat losses, burdens, and success chances stay unchanged. Rest, travel, convalescence, and different activities break Waxing eligibility. Multiply applicable solar/lunar factors before flooring: a boosted Square lesson gives `floor(5 × 1.3 × 1.2) = 7`. A +2 job gain still rounds to +2 at ×1.20. Waxing is conditional on the previous activity; two boosted tutor weeks per month are an opportunity, not a guarantee.
- **Q7/R3:** Only remaining earned loot is subject to retention: three earned Coin retain one, forfeiting two. Coin brought from home is exempt from that forfeiture but can pay the toll. No extra calendar penalty on retreat. Secured checkpoints persist.
- **Q8/Q9:** Metheglin remains limited to the failed-roll reaction. A skip can complete a regular segment or win the finale. Rejecting an unaffordable skip must not change state or RNG. Skipping consumes neither a check roll nor a success-loot roll; ordinary drawing of the next card may still consume encounter RNG.
- **Q10:** Use “percentage points,” not “10%” or “−10% to the die”: 60% becomes 70%, and 90% becomes 95% after clamping. Keep the existing 5–95% bounds.

### Q13 timing and accounting

1. A home activity spends its normal week and resolves its effects. If it causes collapse, charge `min(20, treasury)` once for that collapse, even if the triggering activity used the final campaign week. Purse Protection does not reduce this fee.
2. If time remains, force one convalescence week and reduce both burdens by 15, floored at zero. If still at/above a derived ceiling, keep the recovery-only restriction and spend further available weeks at −15/−15; do not charge the fee again. Distinguish a new collapse from continuation of an existing recovery episode.
3. A pilgrimage wipeout settles carried losses, consumable loss, retained Coin, and the existing medical fee immediately. Keep equipment and secured checkpoints. If a week remains, spend one convalescence week and reduce both burdens by 35, floored at zero. Do not also reset burdens to zero or apply the home recovery in that same week.
4. If still collapsed after wipeout recovery, subsequent forced home recovery uses −15/−15, without a home-collapse fee. Otherwise normal scheduling resumes; further voluntary rest may be prudent but is not compulsory merely because a burden remains positive.
5. Recovery never extends the deadline. With no week remaining, settle the fee/losses and terminal outcome, but grant no numeric recovery. Convalescence does not receive Waning bonuses and clears Waxing continuity.

This fixes two ambiguities in the draft: the home fee belongs to the collapse event, not every call to the recovery helper; numeric wipeout recovery belongs to the actual recovery week. The existing legacy zero-reset mode can remain supported for historical comparisons.

## Task breakdown

Each task is a separate implementation unit with tests. Use feature/fix branches in `.worktrees`, Conventional Commits, and implementation PRs per `AGENTS.md`. Do not combine unrelated refactoring. Planning is complete when this document is committed; the unchecked tasks below are future implementation work.

### T1 — Add the selected configuration candidate

- [x] Add `content/variants/open-questions-decisions.json` with Q1, Q2, Q4, Q9, Q12, and R3: tutor burdens 5/0, 0/5, 3/2; `appliesToLabFailures: true`; Waxing `mode: single`, `bonusPct: 120`; skip fee 10; home lunar bonuses 20 each; retreat retention 50 and toll 10.
- [x] Give the overlay a distinct ID and accurate provenance. Record settled rules as settled and numeric tuning as experimental; do not label accepted interpretations `tbd` merely because their numbers remain tunable.
- [x] Keep `rules.default.json` behavior and the existing `astrology-full` (+10%) variant available as controls. The combined candidate becomes complete only after T2/T3 extend it.
- [x] Add register coverage for changed/new experimental fields, including Waxing magnitude. Keep overlay values distinguishable from shipped defaults.

**Tests/acceptance:** `src/tests/config.test.ts` and `variants.test.ts` validate the effective candidate, distinct hashes, overlay stacking, and provenance. Verify all exact values above and that loading the default or existing comparison variants preserves their behavior.

**Depends on:** none.

### T2 — Apply Square to both tutor burdens

- [x] Extend the solar schema with `squareTutorFatiguePct`, defaulting to 100 for legacy configurations; retain `squareTutorMelancholyPct`. Set both to 200 in the candidate. Apply the new factor in `src/core/astrology.ts` through the existing pipeline.
- [x] Add defaults, validation, provenance/register entries, and candidate settings together. This deliberately avoids the draft's field rename: two existing-style factors preserve the old control behavior without a migration or a new additive modifier system.
- [x] Keep Square's stat-gain factor at 130 and restrict the burden factors to tutoring.

**Tests/acceptance:** Cover all three tutors with candidate and legacy settings in `astrology.test.ts` and home scenarios; assert the six normal/Square burden pairs above, combined solar/lunar gain of 7, and no Square effect on job/rest burdens. Existing config snapshots without the new field load through defaults.

**Depends on:** T1 for candidate integration.

### T3 — Implement bounded recovery and home-collapse fees

- [x] Extend `failure.wipeoutBurdenReset` to accept `{ recovery: 35 }` as a configurable nonnegative integer recovery, preserving `zero` and `unchanged` legacy modes. Add `failure.homeCollapse.fee` with legacy default 0; select 20 in the candidate and retain recovery 15/forced week true.
- [x] Implement the Q13 timing contract above in `src/core/pilgrimage.ts` and `reducer.ts`. Charge home fees at the initial home-collapse transition, not repeatedly from the shared convalescence helper.
- [x] Emit explicit burden/Coin events. Give home physician fees a distinct source from pilgrimage medical fees and include them in metrics, traces, and report accounting. Record nominal/paid amounts if needed to distinguish shortfalls without inferring them from remaining treasury.
- [x] Update relevant types, config validation, invariants, register/provenance, and candidate overlay. Keep existing recovery modes working for controls.

**Tests/acceptance:** Add reducer, pilgrimage, scenario, and metrics regressions for both burden collapses, Coin wipeout, zero/partial/exact fee funds, odd-stat purse retention, repeated recovery, and last-week/penultimate-week collapse. Assert no debt, duplicate fee, double recovery, extra playable week, or premature departure while still collapsed. Assert consumable loss/equipment retention/checkpoint persistence and unchanged historical modes.

**Depends on:** T1; independent of T2's engine change.

### T4 — Lock down retained rules and experiment reporting

- [x] Audit existing tests before adding missing cases for Q2–Q4, Q6–Q12, R2/R3. These are primarily contract confirmations, not reasons to rewrite working code.
- [x] Cover New Moon entry locking, once-only skip, no rollover into Waxing, exact/insufficient fee funds, final-card victory, no skip loot/check-roll, and unchanged state/RNG on rejection.
- [x] Cover relic threat versus approach, Gambeson ordering, Weighted Coin/Purse Protection stacking, Opposition success/failure/Stables rounding, retreat shortfalls/order, and consumable legality at waystations versus failed-roll reactions.
- [x] Cover Waxing interruption/non-compounding, exact activity eligibility for home lunar bonuses, and paid-only Waning recovery.
- [x] Fix report astrology completeness detection to depend on effective feature settings, not solely on `tbd` provenance. Changing a field's status must not make a disabled-bonus control appear fully configured. Preserve old report fields or explicitly version changes and update fixtures.
- [x] Ensure simulation policies use effective protection, fees, Square burdens, skip availability, and recovery restrictions without hardcoded obsolete defaults. Change policies only where required for legality or correct rule evaluation; do not tune their strategy while measuring rule changes.

**Tests/acceptance:** Relevant encounter/items/astrology/scenario suites pass; policy campaigns remain legal under candidate and controls. Report/CLI tests distinguish disabled and enabled astrology, include new fee accounting, keep skips separate from successful rolls, and reproduce deterministic exports. Update golden files only for explained output changes.

**Depends on:** T1–T3 for the complete integration checks.

### T5 — Synchronize the design and implementation references

- [x] Update thematic §§2–5 with tutor mapping, Purse Protection rounding, both Square burdens, non-compounding ×1.20 Waxing, +20% home lunar bonuses, per-New-Moon-segment skips, relic percentage points, retreat costs, and collapse timing/fees. Correct the encounter failure sign: failures add Fatigue/Melancholy or subtract Coin. Explicitly restrict Full Moon doubling to burdens.
- [x] Update the technical plan's affected calendar/modifier/pilgrimage/config sections, including forfeit-before-toll order and deadline settlement.
- [x] Update the parameter register and `implementation-tasks.md` §5 with resolved rule references and experimental values; fix the stale §9 reference. Remove the implication that absence from the parameter table settles module-owned rule questions.
- [x] Mark the old draft superseded by this document. Update README with candidate commands, current item-acquisition limitations, and links to this task list. Keep schema/provenance changes synchronized in their implementation PRs rather than waiting for this documentation task.

**Acceptance:** All Q1–Q13 and all 17 original register paths map to a settled rule or explicitly experimental number. Docs distinguish actual shipped defaults from candidate settings. The old draft cannot be mistaken for the active decision record. No claim of “balanced” or “implemented” appears without corresponding evidence.

**Depends on:** T1–T4; draft wording may be prepared earlier.

### T6 — Run controlled balance comparisons (existing F1/F2)

- [x] Preserve a reproducible pre-change control: source revision, full effective config/hash, exact policy parameters, seed set, commands, and reports. Use the legacy-compatible settings above to compare rules under the same updated executable where possible; compare old-revision runs as a separate historical check.
- [x] Run 1,000 campaigns × seven policies × twelve signs per configuration (84,000 per config). Use policy-independent paired seed sets and strict invariant checks. Increase close comparisons to 5,000 runs per policy/sign as in F1. *(Done at 1,000; the paired CIs were already tight, so no 5,000-run reruns were needed. See the report.)*
- [x] Compare Q1 burden mapping, Q2 protection, Q4 Waxing, Q5 Square, Q9 skip, Q12 home bonuses, R3 toll, and each Q13 change independently against the control before the combined candidate. Hold skip settings constant when comparing home bonuses 0/10/20; compare skip off/5/10 separately. Use small documented overlays rather than an undocumented mutable config.
- [x] Then check interactions: Laboratores mapping + protection + skip; Square + lunar gains; retreat toll + wipeout recovery + home fee. Run harder-finale variants (`final-n10`, `final-road-30`, then both) on the combined candidate before extending route length. A harder finale might hurt balanced policies too; do not assume it fixes specialist dominance.
- [x] Report victory uncertainty, completion weeks/checkpoints, Estate approach shares, paid/free/forced recovery, collapse/wipeout/retreat counts, fees actually paid, zero-treasury loops, skip use, and remaining resources. Inspect representative paired traces for apparent exploits and failed recovery cycles.
- [x] Treat Stables-only as a control. Repeat key comparisons with documented plausible policy-threshold changes separately from rule comparisons; bots are heuristics, not proof of optimal player behavior.

**Acceptance:** Every claimed improvement has reproducible runs and traces, not just an aggregate win rate. Small differences with overlapping uncertainty remain inconclusive. Report tradeoffs and proposed numeric adjustments explicitly; no automatic Smuggler fallback, finale increase, or unrelated mechanic change.

**Depends on:** T1–T5. This fulfills F1/F2 rather than creating a competing balance workstream.

**Result:** [balance-report-baseline.md](balance-report-baseline.md). The current bots never skip and never collapse at home, so Q9 and the physician fee remain unmeasured; that needs separate policy work.

### T7 — Record the balance result and promote the baseline (existing F3/G1)

- [x] Write `docs/balance-report-baseline.md` with the selected rules, control/candidate comparisons, remaining tuning uncertainty, item-free scope, and reproduction instructions.
- [x] Promote selected numeric settings into the intended shipped defaults/experimental overlay consistently, preserving the old control through a named config snapshot and source revision. *(Promoted to `rules.experimental.json`; shipped defaults remain the legacy control pending design sign-off.)* Numeric revisions require a stated result and rationale; changes to the settled rules require an explicit design amendment.
- [x] Run `npm test` and `npm run typecheck`; run a strict candidate campaign batch and deterministic replay checks. Update default-sensitive tests and report fixtures with reviewed expected values.
- [x] Complete README/deliverables updates. Mark these tasks complete only when their acceptance criteria hold. During subsequent review, archive finished planning documents to `docs/archive` and repair links per repository instructions; keep deferred work discoverable.

**Acceptance:** A single documented baseline can be reproduced, new rules have regression coverage, and outstanding numeric tuning is clearly distinguished from unresolved rule semantics.

**Depends on:** T6. Natural item acquisition does not block this item-free baseline milestone.

### T8 — Separate follow-up: first-waystation item experiment

**Decision:** Defer this feature from the baseline PRs, but use the following concrete experiment when implementing acquisition. This replaces an unconditional grant and per-encounter drops for the initial experiment.

- [ ] Add an opt-in acquisition mode: one 25% reward chance on first securing each regular waystation. No repeat/retry/finale grants, and no draws while acquisition is disabled. Append a dedicated item stream after the existing `jobs`, `encounters`, and `rewards` RNG streams, preserving their seed derivation; test that acquisition does not perturb encounter/check/Coin-loot draws. Update state contracts and fixtures for the added stream.
- [ ] Add a separate experiment reward table with weight 2 per consumable and 1 per equipment item. Keep `testRewardTable` equal-weight behavior as a fixture, with no implied production rarity. Validate chance bounds, item IDs, weights, and positive total weight.
- [ ] Award successful draws to persistent home inventory, emit an item-grant event, and leave currently carried slots unchanged. Secured grants survive later retreat/wipeout; consumables already carried still follow ordinary wipeout rules. Returning home is required to select newly awarded supplies for a later departure.
- [ ] Wire acquisition into checkpoint securing in `pilgrimage.ts`; use secured progress to prevent repeat grants. Do not merely enable the current `items-test-table` variant: `drawItemReward` currently has no campaign caller.
- [ ] Test first/repeat arrivals, no-drop/drop boundaries, disabled-mode RNG stability, no finale grants, item ownership across return/wipeout, slot limits, and deterministic replay. Compare against item-free and explicitly labeled starting-inventory experiments on paired seeds.
- [ ] Report grants, use, and outcome effects separately from acquisition frequency. Five reached waystations imply an expected 1.25 grants at 25%, not 1.25 for every campaign. Keep chances/weights experimental until evaluated; update docs and provenance when the feature actually ships.

**Depends on:** T7 for evaluation against a stable baseline. This work must have its own tests and implementation PR.

## Completion order

T1 → T2/T3 → T4 → T5 → T6 → T7. T2 and T3 may be implemented independently once the shared candidate exists. T8 follows as a separate item experiment. Future UI work should show remaining encounters, skip cost/availability, modifier effects, and recovery fees from these rules; it is not part of this engine plan.

*Final decisions and task breakdown prepared by Codex.*
