# Balance report: stages 0–1 (interim, before the gate)

**Status:** interim report for tasks B1–B3 of [the balance-testing plan](balance-testing.md). It covers stage 0 (the real gap between build shapes on the experimental baseline, the soft ending requirement, the Coin loophole) and stage 1 (the config-only S3 × S4 grid). It ends at the **gate**: no config-only change meets the success criteria, so the designer chooses whether to build R1 (S5, training bands), R2 (S6, segments need N successes) or both. Nothing here changes a default.

Full tables, including every paired interval: [balance-report-stage1-tables.md](balance-report-stage1-tables.md).

## Setup

| | |
|---|---|
| Rules | `content/rules.experimental.json` over defaults (config `b9eb341c4fba6729`), 96 weeks, five regular segments of five cards, eight-card finale, item-free |
| Stage 0 | 63 policies on the baseline: the 7 published bots, 11 build presets, 27 ending-floor variants (spec/duo/hybrid × floor 20/30/40), 18 budget-matched builds |
| Stage 1 | opposing loss {1, 0} × disadvantage {75, 60, 50}: 5 new configs × 29 policies (presets and budget builds) |
| Batch | 1,000 runs per policy and sign = 12,000 per policy; **2.5 million strict campaigns** in total; search seed `20261113`, paired seeds across policies and configs |
| Code | simulation code at `d51150d` (branch `feature/balance-testing`) |
| Statistics | paired differences with a normal 95% interval; `**` in the tables = interval excludes zero |

Reproduce:

```sh
npx tsx scripts/balance-testing/run.ts --stage 0 --out reports/balance/stage0   # ~11 min on 15 cores
npx tsx scripts/balance-testing/run.ts --stage 1 --out reports/balance/stage1   # ~23 min
npx tsx scripts/balance-testing/analyze.ts --stage0 reports/balance/stage0 --stage1 reports/balance/stage1
```

### Bot notes (B1)

The build policy follows §4 of the plan, with two corrections made after trace review of a first stage 0 batch (that batch was discarded):

1. **Readiness is judged as if she were rested.** Read from the tired state, a `spec-b` with ending floor 20 met kept buying lessons for 30 weeks: fatigue held the survival estimate down, she read that as a lack of skill, and every lesson added more fatigue. Readiness now assumes zero burdens, as it already assumed the full wanted purse; the departure-burden check then makes her rest.
2. **Jobs are valued at expected Coin plus any stat gain the build wants**, priced at what a lesson charges per point (20 Coin / 5 = 4 per point). Pure expected Coin sent `duo-o` to the Alehouse (Laboratores, a stat she never uses) instead of the Scriptorium. This is still not "success chance".

Published bots are unchanged (a fixture test generated on `main` checks this). The build presets are clearly more conservative than the published specialists: `specialist-l` wins at a median of week 41 and `spec-l` at week 52. Comparisons below are within the build family only. Tuning is stage 5.

## Findings

### 1. Everyone wins; the game is a speed race

Every preset except `even` wins at least 99.8% of campaigns on the baseline (`even` 97.3%). Win rate does not separate the shapes. **Speed does**, so the win-by-week curve and the paired victory week (a loss counted as week 97) are the measures that matter.

| shape | median win week, B / O / L lead | profile at victory (median, lead first) |
|---|---|---|
| spec (100/0/0) | 56 / 55 / 52 | 100 · 15 · 5 |
| duo (80/60/0) | 68 / 63 / 61 | 83 · 65 · 9 |
| hybrid (70/45/30) | 68 / 65 / 63 | 76 · 49 · 32 |
| even (60/60/60) | 81 | 63 · 62 · 66 |

Paired against the specialist with the same lead, a hybrid is **10.5–12.2 weeks slower** (all intervals exclude zero), and a duo 8.6–12.1 weeks slower.

### 2. Time tracks total stat points bought

Under flat lesson prices every point costs the same, roughly a lesson week plus 1–1.5 weeks of work to pay for it. The finish line is set by one number: a specialist's survival estimate for the finale passes once her lead reaches about 100. Breadth is therefore pure extra cost.

- `duo-b` (≈ 80 + 60) and `hybrid-b` (≈ 70 + 45 + 30) buy about the same total. Their paired victory weeks differ by −0.0 weeks [−0.1, 0.1], although their profiles differ completely.
- `even` buys the most and is slowest.
- **Budget-matched builds:** at the same tutor Coin cap, every split shape is slower than all-in-main, for every lead and both budgets (200 and 300 Coin): +5.4 to +15.8 weeks. Win rates are equal (100%). The pure build often stops short of its cap (134 of 200 Coin for B), because its lead stat alone already makes the finale estimate pass.
- Jobs supply much of the lead stat. `spec-b` buys about 10 lessons (+50) and reaches 100 through the Village Watch's +2 per successful week. A lever on tutor price alone (S5 `tutorCost`) can be bypassed this way. `jobGainMax` exists for this reason.

### 3. Secondaries are used, but they do not pay for themselves

The per-run share of cards answered with a non-lead Estate is about 25% for specialists (mostly early on, when all stats are near 15) and 45–50% for duos and hybrids. Against the threat that counters the lead, duos and hybrids switch to the secondary on 93–99% of cards. So the secondary does answer the counter. It does not save time, because a survived failure still advances the segment (finding 5).

### 4. The soft ending requirement (S2) already favours hybrids

**Incidental eligibility.** Hybrids qualify at 20 and 30 in every victory, and `even` at 40. No spec or duo victory reaches 20 in all stats.

**Deliberate price** (same preset with `endingFloor` X against floor 0, paired, median win week):

| | floor 20 | floor 30 | floor 40 |
|---|---|---|---|
| spec | +9 | +16 to +18 | +23 to +25 |
| duo | +5 to +7 | +9 to +11 | +13 to +15 |
| hybrid | 0 | 0 | +4 to +6 |

Win rates fall by at most 3.3 points. The plan's guide (about 3 weeks for a hybrid, clearly more for a specialist) holds, and the gap is wider than expected.

**Shapes under an enforced floor.** If every shape must reach the same floor, hybrids win the race:

| floor | hybrid − spec, paired Δ victory week (B / O / L lead) |
|---|---|
| 20 | +3.1 / +1.0 / +2.7 |
| 30 | **−4.3 / −5.8 / −5.9** |
| 40 | **−7.8 / −9.8 / −8.7** |

Caveat: the `spec` preset keeps its 100 lead target on top of the floor, so it buys more in total. A specialist that stopped at the lowest lead that passes the finale would do better. The stage 5 grid covers that.

### 5. Config-only changes (stage 1)

| config | spec median (B/O/L) | hybrid median (B/O/L) | `even` | hybrid − spec, paired Δ week |
|---|---|---|---|---|
| baseline (loss 1, dis 75) | 56 / 55 / 52 | 68 / 65 / 63 | 81 | +12.1 / +10.5 / +12.2 |
| opp1-dis60 | 56 / 54 / 52 | 68 / 65 / 63 | 81 | about the same |
| opp1-dis50 | 56 / 54 / 53 | 68 / 65 / 63 | 81 | about the same |
| opp0-dis75 (S3) | 56 / 54 / 52 | 62 / 60 / 59 | 73 | +6.7 / +5.2 / +7.0 |
| opp0-dis60 | 56 / 54 / 52 | 62 / 59 / 58 | 73 | see tables |
| opp0-dis50 | 56 / 54 / 53 | 62 / 59 / 58 | 73 | see tables |

- **S3 (opposing loss 0) helps breadth and nothing else.** Hybrids win by week 70 in 11–23 points more campaigns. `even` gains 31.5 points by week 70 and 2.2 points of win rate. Specialists do not move: they barely train secondaries, so there is no loss to remove. Trace check (both moves exceed 20 points): final profiles are identical, and hybrids need about 2 fewer lessons (−37 Coin), which accounts for the 5–6 weeks. It roughly halves the hybrid's deficit, from 10.5–12.2 weeks to 5.2–7.0. It also makes the hybrid faster than the duo for the B lead (−2.8 weeks paired), so the modest third stat is no longer cosmetic there.
- **S4 (disadvantage 75 → 60/50) does almost nothing.** Failures survived per segment visit rise from 2.00 to 2.09 for `spec-b`; retreats rise slightly; win rates and medians do not move. Two reasons:
  1. **A survived failure still advances the segment**, and a specialist's burden ceiling (about 117 at lead 100) absorbs several 15-point failures. The odds penalty costs resources, not progress.
  2. The specialist's finish is pinned to lead 100 by her preset, so she has no other stat to train when the odds worsen.

  S4 does slow the under-built budget builds (all-in-main at 200 Coin, B lead: median 45 → 49), and it narrows the budget split gap for the O and L leads to 2.3–3.6 weeks. It is not harmful, so per the plan both values are carried into stage 3, where failures stop progress.

### 6. The Coin loophole is not an exploit

`wealthy-l` (10 failures carried, New Moon skip below 50% odds) against `spec-l`: win rate equal, median 51 against 52, won by week 60 +3.1 points [2.5, 3.7]. She carries 47 Coin per departure against 32, and skips 0.83 cards per run. That is a small edge, not a dominant one, and the three spec leads stay within 4 weeks of each other. **S7 (R3) is not triggered.**

## Success criteria (§6)

| config | hybrids ≥ 95% | best hybrid within ~5 wk of best spec (or more reliable) | budget: split ≥ pure on win | budget: split ≥ pure on speed | leads within 10 pts / 5 wk per shape | best median < 80 |
|---|---|---|---|---|---|---|
| baseline | pass (99.8) | **fail** (63 vs 52) | pass | **fail** | **fail** (duo 7 wk) | pass (51) |
| opp1-dis60 | pass | **fail** (63 vs 52) | pass | **fail** | **fail** (duo 7 wk) | pass |
| opp1-dis50 | pass | **fail** (63 vs 53) | pass | **fail** | **fail** (duo 7 wk) | pass |
| opp0-dis75 | pass | **fail** (59 vs 52) | pass | **fail** | **fail** (duo 6 wk) | pass |
| opp0-dis60 | pass | **fail** (58 vs 52) | pass | **fail** | **fail** (duo 6 wk) | pass |
| opp0-dis50 | pass (100.0) | pass, at the limit (58 vs 53) | pass | **fail** | **fail** (duo 6 wk) | pass |

"Budget on win" passes only because everything wins. The speed version is the meaningful test, and it fails everywhere. Hybrid-lead spreads are within 3–5 weeks; the duo spread (B lead slowest) is what fails the lead criterion.

**Diagnostics.** Specialists are not under 90%, but they are 5–12 weeks ahead, so specialising still has no cost. `even` is viable under S3 (99.5%) but is the slowest shape everywhere (73 against 51–62).

## The gate

Config-only changes do not meet the criteria. **Decision for the designer:** build R1 (S5), R2 (S6), or both.

The evidence points this way:

1. **R2 / S6 (segments need N successes) addresses the cause S4 exposed.** Today a failure costs only resources, which specialists have in abundance, so coverage of the counter matchup is worth nothing in time. Under S6 a failure costs progress, and switching to a strong secondary against the counter threat (which duos and hybrids already do on 93–99% of those cards) should start paying. That is exactly the hypothesis the plan says S6 must prove. S4 should be combined with it, because S4 only bites when failures matter.
2. **R1 / S5 (training bands) addresses finding 2**, the flat price per point. It needs `jobGainMax` alongside the tutor bands, because jobs supply about half of a specialist's lead stat. By itself it makes mastery dearer without making breadth useful, so the budget-matched speed test is its real check.
3. **S2 as an actual ending reward already reverses the race at floor 30** (finding 4). If the designer wants the "best ending" to require a modest stat in every Estate, much of the goal is met without a rule change to the road. That is a finale/ending design question rather than a stage 2/3 item.

**Proposed shortlist for stages 2–3** (baseline plus up to three): `baseline`, `opp0-dis75` (S3), `opp0-dis50` (S3 + S4 50), `opp0-dis60`. S3 is the only config change that helped, and it did no harm.

**Not needed:** R3 / S7 (finding 6).

## Limits

- Bot quality bounds every conclusion. The build presets are slower than the published specialists, and the spec preset's fixed lead target of 100 decides when she enters the finale. The stage 5 grid over targets and `carryFailures` is the check.
- Budget shapes set targets as 15 + 5 × lessons, ignoring the sign bonus, opposing loss and job gains. Achieved profiles are reported beside each one.
- Medians are winner-only. They are always read beside the paired victory week, which counts a loss as week 97.
- Items are off; there is no UI; the finale is the current eight-card gauntlet.
