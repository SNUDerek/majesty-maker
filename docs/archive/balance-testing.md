# Balance testing plan: rewarding a rounded scion

**Status:** B1–B3 implemented and stages 0–1 run; see the [interim report](balance-report-stage1.md). **At the gate:** no config-only change meets §6, and the designer chooses R1, R2 or both. R1–R3 and E1 are not implemented. It selects candidate changes from [proposal A](archive/balance-proposal-a.md) and [proposal B](archive/balance-proposal-b.md), guided by [the design opinions](archive/balance-opinions.md), in response to finding 1 of the [baseline report](balance-report-baseline.md) (specialist dominance). Revised after [the critique](balance-testing-critique.md).

**Goal:** one strong Estate, one useful secondary and a modest third should be a competitive way to play, with real tradeoffs against a one-stat build. A strict even split need not be optimal, and a specialist need not be made to lose.

**Fixed for every experiment:** `content/rules.experimental.json` as the baseline, 96 weeks, five regular segments, item-free, all twelve signs, `--strict`. Search seed 20261113; a separate seed is reserved for confirmation (§5).

## 1. What is selected

| # | Change | Source | Kind | Built when |
|---|---|---|---|---|
| S1 | Fair bots and spread metrics | A §4, B step 1 | simulation only | first |
| S2 | "Best ending" soft requirement, as a metric and a bot objective | B option 5, opinions | simulation only | first |
| S3 | Tutor opposing loss 1 → 0 | A fallback, B option 1 | config only | first |
| S4 | Disadvantage multiplier 75 → 60 / 50 | A (E), B option 2 | config only | first |
| S5 | Non-linear tutors: bands for gain, cost and job growth | A (B), B option 4, opinions | new rule | if stage 1 falls short |
| S6 | Segments need N **successes** | opinions, A cause 5 | new rule | if stage 1 falls short |
| S7 | Coin ceiling: purse capacity, encounter protection cap | A (D), B Laboratores | new rule | if a Coin exploit is shown |

S5–S7 are implemented only when the stage before them shows they are needed (§5, §7). S5 and S6 are the two ideas the design opinions favour, so the gate after stage 1 is a decision point for the designer, not an automatic stop.

### Not selected for this round

- **Hard finale gate at 30 in each Estate (B option 5).** Replaced by S2. The metric deliberately does not test the same gameplay as a gate.
- **Acclamations finale (A, C).** The finale is due a multi-phase redesign after this phase.
- **Opposing loss only when training the highest stat (A, A).** `opposingLoss: 0` is simpler and is tested first.
- **Reserve, because they demand breadth directly:** the support-stat formula (B option 3), Trial cards (A, C) and a road bonus from the lowest stat (A, F). If S6 turns out to reward success without rewarding breadth (see S6), one of these is the next candidate.

## 2. The soft ending requirement (S2)

Eligibility can be measured now with no rule change. `runs.csv` exports `finalStats`, and a victory ends the campaign, so final stats are the stats at victory. There are three separate questions, and each needs its own measurement.

| Question | Measurement |
|---|---|
| How often is the threshold reached **incidentally**? | Derived columns `minFinalStat >= 20 / 30 / 40` on existing runs. Report the rate among **all campaigns** and among **victories**. |
| What does **deliberately** earning it cost? | The same policy run twice on paired seeds: with `endingFloor: 0` and with `endingFloor: X`. One targeted run per threshold (20, 30, 40). |
| Who pays most? | The deliberate comparison for `spec-*`, `duo-*` and `hybrid-*` of each lead. |

`endingFloor` is a policy objective, separate from the build targets (§4): the bot will not enter the finale until every stat is at least `endingFloor`. Without that enforcement a bot could win before qualifying, and the comparison would not measure a price.

The price is reported as the paired difference in win rate, the win-by-week curve and the median win week. No engine code is needed until endings exist.

## 3. Rule designs

Every new rule gets a config field whose default reproduces today's behaviour. The legacy control and the experimental baseline must produce identical `runs.csv` outcomes before and after each engine PR (config hashes change; campaign data must not). Repeat the report's historical check: first 100 paired seeds per policy and sign.

### S3. Opposing loss off

Overlay: `classes.tutors.*.opposingLoss: 0`. No code.

A hybrid's most useful secondary is the Estate her main **beats**, because it counters her own counter (Bellatores main → Laboratores secondary answers Oratores threats). Each tutor's opposing stat is exactly that Estate (`hedge_knight` lowers Laboratores). Today, training the main stat erodes the best secondary.

### S4. Disadvantage multiplier

Overlays: `encounters.matchupPct.disadvantage: 60` and `50`. No code.

### S5. Training bands

A band table selected by the affected stat **before** the activity. Every field except `from` is optional; an omitted field keeps the legacy value. This lets each lever be tested alone.

```json
"classes": {
  "trainingBands": {
    "basis": "stat",
    "bands": [
      { "from": 0,  "tutorGain": 5, "tutorCost": 20, "jobGainMax": 2 },
      { "from": 40, "tutorGain": 4, "tutorCost": 30, "jobGainMax": 1 },
      { "from": 70, "tutorGain": 3, "tutorCost": 45, "jobGainMax": 1 }
    ]
  }
}
```

- `trainingBands: null` (default) is today's flat rule.
- `tutorGain` and `tutorCost` replace the tutor's base values; astrology modifiers apply afterwards as now.
- `jobGainMax` caps the job's **base** stat gain, before astrology. It is its own lever: a specialist's job gives +2 to her main stat every successful week, which can bypass tutor bands.
- `basis: "stat"` selects the band by the stat's value: advanced techniques need dearer tutors. This is the lead candidate and matches the in-world reasoning.
- `basis: "gap"` selects by `stat − lowest stat`: diminishing returns from over-specialising (proposal A's version).

Overlays, one lever each, then combinations of the promising ones:

| Overlay | Basis | tutorGain | tutorCost | jobGainMax |
|---|---|---|---|---|
| `bands-gain` | stat | 5 / 4 / 3 | — | — |
| `bands-cost` | stat | — | 20 / 30 / 45 | — |
| `bands-job` | stat | — | — | 2 / 1 / 1 |
| `bands-all` | stat | 5 / 4 / 3 | 20 / 30 / 45 | 2 / 1 / 1 |
| `gap-gain` | gap 0 / 20 / 40 | 5 / 3 / 1 | — | — |
| `gap-all` | gap 0 / 20 / 40 | 5 / 3 / 1 | — | 2 / 1 / 1 |

Rough cost of 20 → 100 by lessons alone under `bands-all`: about 22 lessons and 770 Coin, against 16 lessons and 320 Coin today. Reaching 70 costs 12 lessons and 320 Coin. These figures ignore astrology and job gains.

**What S5 can and cannot show.** It makes mastery expensive on purpose. That alone does not show that breadth is *useful*; it may only delay the same build. The budget-matched comparison in §4 is the test for that.

**Code:** `tutorCost`, `resolveTutor` and `resolveJob` in `src/core/economy.ts` (one lookup each); schema and validation in `src/core/config.ts` (bands sorted, first `from` is 0, positive integers).

### S6. Segments complete on N successes

```json
"route": { "completion": "successes", "maxCards": null }
```

- `completion: "encounters"` (default) is today's rule: every survived card advances.
- `completion: "successes"`: only a success (or a New Moon skip, per Q9) advances. A survived failure charges its penalty and returns to `continue_or_retreat` with no progress.
- `maxCards` is the optional turn limit, as extra cards allowed beyond N (`null` = unlimited). Hitting it without N successes forces a retreat under the normal retreat rules.
- Applies to regular segments and the finale alike.

**This is a hypothesis, not a breadth rule.** All N successes can still come from one highly developed Estate, and requiring success could reward the specialist's better odds even more. The question S6 answers is: *does requiring successes make switching approach valuable enough to justify secondary investment?* It is confirmed only if, under S6 compared with the same config without it:

- the share of cards answered with a non-lead Estate rises for hybrid and free-approach specialist bots, and
- budget-matched split builds (§4) gain more than pure builds do.

If neither happens, drop S6 or pair it with a reserve lever that demands breadth.

**Cost of a failure.** A week is spent entering a segment, not per card. Under S6 a failure costs its resource and an extra card; it costs calendar time only indirectly, through earlier retreats, recovery weeks and retries.

| Overlay | Regular N | Finale N | `maxCards` |
|---|---|---|---|
| `succ` | 5 | 8 | null |
| `succ-short` | 4 | 6 | null |
| `succ-cap3` | 5 | 8 | 3 |

`succ-short` only roughly offsets the longer road. Expected cards are N divided by the success rate, so the offset differs by build. Report cards drawn per segment for every policy and read `succ` against `succ-short` with that in view.

A failure penalty of 20 is a secondary overlay, tested only on a shortlisted S6 config.

**Code:** `advance` and `applyFailure` in `src/core/pilgrimage.ts`. `encounterIndex` keeps meaning "progress toward N", so `lengthOf` and the waystation logic are untouched; add a `cardsDrawn` counter on `PilgrimageState` for `maxCards` and events. `estimateSegmentSurvival` in `src/simulation/policies.ts` changes its stopping rule to "N successes before the failure budget runs out". Invariants need the new counter.

### S7. Coin ceiling

Proposal A's probes show the Laboratores specialist is resilient to every overlay tried. They do not show it is immune to S6, and no current bot carries a large purse. So the first step is to **exhibit the exploit** with the `wealthy-l` policy (§4). S7 is built only if that policy, or `spec-l`, leads the other specialists on a shortlisted config.

Two independent overlays:

- `route.purseCapacity: 60` (default `null`). This is an on-road capacity, not only a packing limit: carried Coin can never exceed it. The departure action's `maxCarry` is clamped, and encounter loot above the capacity is forfeited (not added to carried or earned Coin). A packing-only limit would leak, because loot accumulates across continued segments.
- `failure.purseProtection.encounterCapPct: 25` (default `null`). Caps protection on encounter failures only; wipeout retention keeps the full formula, so Q2 stays settled.

**Code:** a clamp at departure and in `reward` in `src/core/pilgrimage.ts`, one `min` in `failurePenalty` in `src/core/encounter.ts`, schema in `src/core/config.ts`.

## 4. Simulation work (S1, S2)

The seven published bots stay unchanged, so old reports remain reproducible. New policies are added beside them.

### The build policy

One parametrised policy. Its three concerns are kept separate.

**1. Build targets (what she becomes).**

| Parameter | Meaning |
|---|---|
| `lead` | main Estate |
| `mainTarget`, `secondaryTarget`, `thirdTarget` | **minimum** stats. Secondary is the Estate the lead beats. A target of 0 means "never train this stat". |
| `endingFloor` | every stat must reach this (S2); 0 = off |

- Targets are minimums, not ceilings and not preferences. In ordinary presets they and `endingFloor` are **hard requirements for entering the finale**, so every victory has at least the preset's shape. Budget probes have one explicit exception: after the tutor budget cannot fund another lesson, build targets become allocation objectives rather than finale requirements. `endingFloor` remains mandatory even then.
- Training choice: the trainable stat with the lowest `current / target` ratio; ties go lead → secondary → third.
- When all targets are met but she is still not ready, she keeps training past them: lead first, then secondary, then third, skipping stats with target 0. If nothing is trainable (all at the stat cap), she departs anyway.

**2. Departure readiness (when she goes).**

- Regular segments: depart when the survival estimate for the next segment is at least `survivalThreshold`, burdens are at or below `departureBurden`, and the Coin budget is met. Otherwise train (if Coin allows), rest, or work.
- Finale: the same, plus the build targets and `endingFloor`.

**3. Coin budget (what she carries).**

- Carry = `carryFailures ×` the Laboratores failure cost after Purse Protection, **only if** she may use the Laboratores approach, plus the skip fee if the segment is New Moon and she skips. Bellatores and Oratores failures cost burdens, so they add nothing to the carry.
- If the wanted carry exceeds `purseCapacity` or what she can afford within a few weeks, she carries what is allowed. The survival estimate already accounts for the smaller purse, so she never waits forever.
- Departure need = departure fee + carry. Once ready apart from Coin, she works instead of buying lessons. This removes the `trainingReserve` knife-edge.
- `carryFailures` is part of policy tuning.

Other fixes: jobs are chosen by expected Coin, not success chance. `freeApproach` (default true) lets every bot pick the best approach per card. `useSkip` takes the New Moon skip when the card's best odds are below a threshold.

### Presets

| Id | main / secondary / third | Notes |
|---|---|---|
| `spec-b`, `spec-o`, `spec-l` | 100 / 0 / 0 | free approach; the specialist playing her best game |
| `duo-b`, `duo-o`, `duo-l` | 80 / 60 / 0 | two-stat build |
| `hybrid-b`, `hybrid-o`, `hybrid-l` | 70 / 45 / 30 | the intended shape |
| `even` | 60 / 60 / 60 | strict split |
| `wealthy-l` | 100 / 0 / 0, `carryFailures: 10`, `useSkip` | deliberately tests the Coin loophole |

Every report prints the **achieved** stat profile (median and 10th–90th percentile of each stat at victory and at first departure) beside the preset name, so "hybrid beats specialist" is checked against the shapes actually played.

### Budget-matched comparison

To test whether secondary investment has value, not just whether mastery is dear: for each lead and each config, a script picks builds with the same total tutor spend under that config's prices (for example 300 and 500 Coin), one all-in-main and one or two split shapes, and runs them paired. A rule set passes only if a split build is at least as good as the pure build at the same budget. The initial B3 probes use the same spending cap, not necessarily equal realized spend; read actual tutor Coin alongside the cap. Equal realized-spend validation remains follow-up work before treating this criterion as established.

### Policy tuning

A grid over `mainTarget ∈ {60, 70, 80, 100}`, `secondaryTarget ∈ {0, 30, 45, 60}`, `thirdTarget ∈ {0, 30}`, `carryFailures ∈ {2, 3, 5}` per lead, with the same budget for every family. Tuning runs on the search seed only (§5).

### New metrics

- Incidental ending eligibility at 20 / 30 / 40, among all campaigns and among victories; stat spread at victory.
- Achieved stat profiles, as above. Lessons bought per Estate; weeks before first departure.
- Per-run share of cards answered with a non-lead Estate, by threat. Pooled approach shares are not evidence of breadth.
- Cards drawn per segment and per finale attempt.
- Coin carried at departure, peak carried Coin, failures survived per segment, skips used.
- **Win-by-week curve:** fraction of all campaigns won by weeks 50, 60, 70, 80 and 96. This shows speed and reliability together. Winner-only median and mean win week are reported beside it, never alone.

### Statistics

All comparisons are **paired differences with a 95% interval**, between configs for the same policy and between policies under the same config (batch seeds are policy-independent, so both pairings are valid). Overlap of two separate intervals is not used as a test.

## 5. Experiment stages

Policies are held fixed within a stage. 1,000 runs per policy and sign on the search seed. Overlays live in `content/experiments/balance/`; scripts in `scripts/balance-testing/`, modelled on `scripts/open-questions/`.

| Stage | Configs | Question |
|---|---|---|
| 0 | baseline, new bots | Real gap between shapes; incidental ending rates; deliberate ending price (S2); does `wealthy-l` beat `spec-l`? |
| 1 | S3 × S4 full grid: opposing loss {1, 0} × disadvantage {75, 60, 50} | How far do config-only changes go? |
| **Gate** | — | Criteria met? If so, go to stage 5. If not, the designer picks S5, S6 or both. |
| 2 | S5 overlays on each shortlisted config | Which lever matters: gain, cost or job cap? Does breadth gain value at matched budgets? |
| 3 | S6 overlays on each shortlisted config, without S5 | Does the S6 hypothesis hold? |
| 4 | S7 overlays, only if a Coin exploit is shown in stages 0–3 | Do the three leads move together? |
| 5 | Combine shortlisted pieces; **ablation**; policy tuning | Is every piece needed? Is any preset hiding a better build? |
| 6 | Final package and its ablations at 5,000 runs on a **fresh seed**, policies frozen | Do the conclusions hold? |

Rules for moving between stages:

- **Carry a shortlist, not one winner.** Always keep the unchanged baseline plus up to three promising configs. A change that is weak alone (for example disadvantage 50) may work with S6, so both S4 values go into stage 3 unless stage 1 shows one is harmful.
- **Ablation.** For the candidate package, remove each component once and rerun. A component whose removal changes nothing beyond noise is dropped. The aim is the smallest rule set that meets the criteria.
- **Tune, then freeze, then confirm.** The grid search finishes on the search seed in stage 5. Stage 6 uses the fresh seed for confirmation only; no parameter is chosen from it.
- **Trace-review** any cell that moves by more than 20 points before reading it as a rule effect. The Waxing collapse in the baseline report is the precedent.

## 6. Success criteria

To be agreed before stage 1 results are read.

**Requirements**

- Each `hybrid-*` wins at least **95%** of runs.
- The best hybrid is competitive with the best specialist: its win-by-week curve is not behind by more than about 5 weeks at the median, or it is more reliable at week 96 (paired interval excluding zero).
- At matched tutor budgets, a split build is at least as good as the all-in-main build for each lead.
- No single lead is ahead on both speed and reliability for the same shape; the three leads are within about **10 points** and **5 weeks** of each other.
- The best build's median win week stays under about week 80, leaving room for later social and finale content.

**Diagnostics** (reported and discussed, not pass/fail)

- Specialist win rate and speed against the best hybrid. A viable specialist is acceptable if hybrids are competitive through real advantages; "under 90% or 8 weeks behind" is a flag for whether specialising still carries a cost, not a target.
- `hybrid-*` against `duo-*`, paired. If the two-stat build dominates, the modest third stat is cosmetic for winning, and its value has to come from the ending (S2) or a reserve lever.
- `even` against the best build: viable (around 90% or better) but not the single best.
- Deliberate ending price at floor 30: a guide of about 3 weeks and 2 points for a hybrid, with a clearly higher price for a pure specialist.
- The speed/reliability frontier over the whole grid, by lead.

## 7. Implementation tasks

The reviewed B1–B3 delivery is [archived](archive/balance-testing-b1-b3.md).
The gate, conditional engine tasks, and final validation remain active here.

Each task is its own branch, worktree and PR, with tests, per `AGENTS.md`. B1–B4 change no rules. R1–R3 change no defaults and are **conditional**: each is started only when its stage is reached and the gate calls for it.

| Task | Branch | Contents | Tests |
|---|---|---|---|
| B1 (done) | `feature/balance-testing` | build policy (§4), presets, `endingFloor`, budget logic, expected-Coin jobs, skip use | unit tests per decision: finale blocked until targets and floor are met, over-target fallback, carry fallback when capped; published bots give identical `runs.csv` on a fixed seed |
| B2 (done) | `feature/balance-testing` | metrics and paired-difference analysis (§4) | metrics tests from hand-built event logs |
| B3 (done) | `feature/balance-testing` | S3/S4 overlays, stage scripts, budget-matched script, stages 0–1, interim report | script smoke test at small N |
| — | **gate** | review the interim report; choose which of R1/R2 to build | — |
| R1 | `feature/training-bands` | S5 engine, schema, overlays, stage 2 | band boundaries (39 / 40 / 69 / 70), gap basis, each field optional, job cap before astrology, `null` equals legacy |
| R2 | `feature/road-successes` | S6 engine, schema, survival estimate, invariants, overlays, stage 3 | failure does not advance, skip does, `maxCards` forces retreat, finale needs N successes, legacy equality |
| R3 | `feature/coin-ceiling` | S7 engine, schema, overlays, stage 4 | departure clamp, loot forfeited above capacity, protection cap on failure but not wipeout, legacy equality |
| E1 | `feature/balance-final` | stages 5–6, grid search, ablations, final report with a recommended experimental baseline | — |

The final report recommends values; promoting them into `rules.experimental.json` is a separate decision.

## 8. Risks and open points

- **S6 may favour specialists.** See the hypothesis test in §3. Do not adopt it on win rates alone.
- **S6 and the skip.** A skip counting as a success follows Q9 but lets Coin buy progress. Watch skip use by `wealthy-l`.
- **S5 readability.** The player must see the next lesson's gain and cost before committing. There is no UI yet, but the `TRAIN` available action should eventually carry both.
- **S5 and astrology rounding.** A base gain of 3 with ×1.20 floors back to 3. If Solar and Waxing bonuses stop mattering in the top band, prefer cost bands over gain bands.
- **Forced shapes are a bot convenience.** Gating the finale on build targets guarantees the comparison is between the named shapes, but a real player may depart earlier. The grid and the frontier diagnostic are the check on that.
- **Bot quality still bounds every conclusion.** Tuning with equal budgets, then freezing before confirmation, is the guard.
- **Items are off.** Gambeson and Weighted Coin each strengthen one Estate's own failure pool. Re-check the chosen rule set when T8 lands.
- **Finale redesign.** The S2 price data and the S6 result should feed the multi-phase finale design.
