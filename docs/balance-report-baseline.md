# Balance report: open-question decisions baseline (T6/T7)

**Status:** first controlled comparison of the rules settled in [decision record](archive/open-questions-tasks.md). The initial comparison is reproducible (scripts below); close-comparison escalation and unexercised mechanics remain [follow-up work](open-questions-tasks.md). It **does not show the game is balanced**. The current policy bots are coarse heuristics, and several new rules are never exercised by them (see [Limits](#limits-what-this-batch-cannot-show)).

**Scope:** item-free (`items.acquisition: disabled`, R4), 96 weeks, five regular segments of five encounters, and an eight-encounter finale (R1). This covers rules only; UI and natural item acquisition (T8) are out of scope.

## Setup

| | |
|---|---|
| Source revision | `0bbe7209280f9ec4f784d879c668f3b427c37c13` (branch `feature/open-questions-impl`) |
| Batch | 1,000 campaigns × 7 policies × 12 signs = **84,000 per config**, `--strict` invariants on every action |
| Seeds | `--seed 20261113`; `deriveBatchSeed(seed, sign, run)` is policy-independent, so every config and policy sees the same campaign seeds (paired) |
| Control | `content/rules.default.json` (legacy control), config `c01929d2bd65c0cc` |
| Candidate | `--variant open-questions-decisions`, config `37fb6907993f4cd5` |
| Single changes | `content/experiments/open-questions/*.json`, one decision each over the control |
| Policies | the seven E3 bots with default params, unchanged while comparing rules |

```sh
E=content/experiments/open-questions
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict --out reports/control
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict --variant $E/q5-square.json --out reports/q5-square
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict --variant open-questions-decisions --out reports/candidate
# interactions stack overlays, e.g. Laboratores mapping + protection + skip:
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict \
  --variant $E/q1-burden.json --variant $E/q2-protection.json --variant $E/q9-skip-10.json --out reports/x-lab
# harder finale on the candidate:
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict \
  --variant open-questions-decisions --variant final-n10 --variant final-road-30 --out reports/cand-n10-road30
```

Each `summary.json` records the full effective config, hash, Git commit and argv. A single run can be replayed with `--trace-seed <seed>` plus the same `--variant` flags.

**Historical check:** the legacy control at this revision was compared with `main` at `d48a81d` on the first 100 paired seeds per policy and sign (8,400 runs). Every `runs.csv` field matched, apart from the config hash and the new `physicianFeeShortfalls` column, which is always 0 under the control. The control is therefore a faithful stand-in for the pre-change rules.

## Results with the default bots

The victory rate (percent) is pooled over signs. Brackets give the **paired** difference from the control in percentage points, with a 95% CI. A difference is reported only where that CI excludes zero.

| Config | stables-only | specialist-b | specialist-o | specialist-l | balanced | reckless | pragmatic |
|---|---|---|---|---|---|---|---|
| control | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q1 Smuggler 3/2 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q2 protection | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 57.1 (+4.4 [+4.0, +4.8]) |
| Q4 Waxing ×1.20 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 (−52.7, see below) |
| Q5 Square both | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q9 skip 5 / 10 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q12 home +10 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q12 home +20 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 54.0 (+1.4 [+1.1, +1.6]) |
| R3 toll 10 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.0 (−0.7 [−0.8, −0.5]) |
| Q13 wipeout −35 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| Q13 physician fee 20 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.7 |
| **candidate** | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 (−52.7) |
| Lab mapping + protection + skip | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 57.1 (+4.4) |
| Square + Waxing + home +20 | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 (−52.7) |
| toll + wipeout recovery + fee | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 52.0 (−0.7) |
| candidate + `final-n10` | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 |
| candidate + `final-road-30` | 0.0 | 100.0 | 100.0 | 100.0 | 0.0 | 0.0 | 0.0 |
| candidate + both | 0.0 | 99.9 (−0.1) | 100.0 (−0.1) | 100.0 | 0.0 | 0.0 | 0.0 |

Per run, pooled over every bot except Stables-only:

| Config | win week (median) | furthest checkpoint (mean) | wipeouts | retreats | home collapses | convalescence weeks | rest weeks | medical fee paid | skips | resource-loop deadlines |
|---|---|---|---|---|---|---|---|---|---|---|
| control | 50 | 3.05 | 0.67 | 4.87 | 0.00 | 0.67 | 8.53 | 3.22 | 0 | 15.7% |
| Q2 protection | 49 | 3.05 | 0.65 | 4.87 | 0.00 | 0.64 | 8.46 | 3.05 | 0 | 15.7% |
| Q5 Square both | 50 | 3.05 | 0.68 | 4.87 | 0.00 | 0.67 | 8.64 | 3.25 | 0 | 15.7% |
| Q12 home +20 | 48 | 3.05 | 0.68 | 4.90 | 0.00 | 0.68 | 8.35 | 3.17 | 0 | 21.3% |
| Q13 wipeout −35 | 50 | 3.05 | 0.68 | 4.85 | 0.00 | 0.67 | 8.64 | 3.22 | 0 | 15.7% |
| candidate | 46 | 2.50 | 0.66 | 4.85 | 0.00 | 0.66 | 8.60 | 2.86 | 0 | 9.7% |
| candidate + both harder finales | 47 | 2.50 | 0.70 | 4.94 | 0.00 | 0.69 | 9.00 | 3.20 | 0 | 9.7% |

Median specialist win week, control → candidate: specialist-b 49 → 48, specialist-o 50 → 48, **specialist-l 46 → 41**. Specialists use their own Estate on every encounter. The pooled approach shares (non-Stables bots) barely move: control 26.0/29.4/44.5% (Bellatores/Oratores/Laboratores) versus candidate 27.8/29.0/43.2%.

## Trace review: the Waxing collapse is a bot artifact

The −52.7 pp for pragmatic under Waxing ×1.20 (and so under the candidate) is a rule-triggered policy failure, rather than evidence that the rules make victory impossible. Every affected run ends with identical totals: 0 segment entries, Bel 50 / Ora 52 / Lab 82. A replay shows the cause:

```sh
npm run sim -- --policy pragmatic --birth-sign aries --trace-seed 4275821509 \
  --variant content/experiments/open-questions/q4-waxing.json
```

Pragmatic tutors whenever the treasury reaches `trainingReserve` (40). A prepared departure needs the 10-Coin fee plus a carry of `3 × 15 = 45`, so 55 Coin. Under ×1.20, a repeated Stables week pays 7 instead of 6. That shifts the Stables → train → rest cycle so the treasury is never at 55 while the bot is both stat-ready and rested, and it works until the deadline. The same threshold mismatch makes Balanced lose every control run. The single-change matrix holds bot parameters fixed, so it cannot separate rule effects from this knife-edge.

## Policy-threshold sensitivity (run separately from the rule comparisons)

Here only `trainingReserve` changes, to 60 (above the 55-Coin departure need), for pragmatic and balanced. Each row is 12,000 paired, strict runs (1,000 per sign):

| Config | pragmatic | balanced | pragmatic mean win week | balanced mean win week |
|---|---|---|---|---|
| control | 84.3% | 94.0% | 86.4 | 77.5 |
| Q4 Waxing ×1.20 | 88.3% (+4.0 [+3.2, +4.7]) | 96.6% (+2.6 [+2.1, +3.1]) | 81.8 | 72.8 |
| Q12 home +20 | 87.3% (+3.0 [+2.5, +3.5]) | 94.6% (+0.6 [+0.2, +1.0]) | 85.3 | 76.0 |
| candidate | 99.2% (+14.9 [+14.2, +15.5]) | 99.6% (+5.6 [+5.2, +6.1]) | 73.7 | 65.9 |
| candidate + `final-n10` + `final-road-30` | 78.2% (−6.1 [−7.0, −5.2]) | 95.4% (+1.4 [+0.8, +1.9]) | 87.5 | 70.2 |

With a coherent threshold, Waxing and the home bonuses help, as intended, and the candidate makes generalist play much faster and more reliable. The harder finale costs generalists (pragmatic −6.1 pp versus the control) while specialists still win more than 99.9% of runs. A harder finale on its own does **not** fix specialist dominance.

## Findings

1. **Specialist dominance is unchanged.** All three specialists win at least 99.9% of runs in every config, including both harder finales, usually by week 41–50 of 96. None of the settled rules changes that, and the decision doc did not expect them to. This remains the main open balance problem.
2. **Laboratores is favoured, as Q1/Q5 warned.** Under the candidate the Laboratores specialist gains five weeks (46 → 41); the others gain one or two. That comes from Purse Protection on encounter failures and the 3/2 Smuggler split. Q2 alone is worth +4.4 pp to pragmatic and the lowest wipeout count.
3. **Generalists gain the most from the candidate**, once bot thresholds are coherent: +14.9 pp pragmatic and +5.6 pp balanced, finishing 10–13 weeks earlier.
4. **Retreat toll 10 shows a small provisional cost** (−0.7 pp pragmatic, fewer retreats). No change is proposed.
5. **Q5 (Square on both burdens) and Q1 alone are neutral** for these bots: they add rest weeks but change no outcome.

## Limits: what this batch cannot show

- **New Moon skips (Q3/Q9) were never used.** No bot calls `SKIP_ENCOUNTER`, so skip 5 vs 10 and the skip interactions are identical to the control. Policies were deliberately not changed for this comparison.
- **The home-collapse physician fee (Q13) was never charged.** No bot collapsed at home in 1.6 million campaigns, because they rest at `restMargin`. Its accounting is covered by unit and metrics tests only.
- **Wipeout recovery −35 (Q13)** changes nothing for these bots: there are few wipeouts per run, and bots rest before departing either way.
- The bots are heuristics, not optimal players; Stables-only is a control and never wins. Differences with overlapping CIs, or below about 1 pp, should be treated as inconclusive.

## Baseline promoted (T7)

- The **experimental baseline** `content/rules.experimental.json` now holds exactly the `open-questions-decisions` values (a test enforces this). Use `--config content/rules.experimental.json`.
- The **shipped defaults** (`content/rules.default.json`) stay the legacy control, as a named config snapshot (hash `c01929d2bd65c0cc` at the revision above). This keeps every rule comparison on the same executable. Promoting the candidate into the shipped defaults needs a design sign-off: the evidence above supports the settled rules, but not a claim that the numbers are balanced.
- **Proposed numeric adjustments:** none applied. Next experiments, in priority order:
  1. Bot work, kept separate from rule changes: coherent `trainingReserve` vs departure need, a skip-using policy, and a policy that sometimes pushes to collapse. These are needed to measure Q9 and the physician fee at all.
  2. An anti-specialist lever beyond finale length, such as a nonuniform encounter distribution or a stat-requirement mix.
  3. Watch the Laboratores advantage. Do not switch the Smuggler split automatically (per Q1); revisit only with evidence from a skip-capable policy.

Raw reports are not checked in because they are large. From the repository root:

```sh
bash scripts/open-questions/run.sh reports/open-questions 1000
python3 -I scripts/open-questions/analyze.py reports/open-questions > reports/open-questions/tables.md
node --import tsx scripts/open-questions/thresholds.ts 1000 > reports/open-questions/thresholds.md
```

The first command runs all 19 configurations sequentially with strict invariants.
The threshold script fixes `trainingReserve: 60`, base seed 20261113, all twelve
signs, and both generalist policies, and prints paired normal-approximation 95%
intervals using the sample variance of per-seed victory differences. The analysis
script uses the same method for the main matrix. Use 5000 instead of 1000 for
close-comparison escalation, which remains pending; small effects are provisional.

Replaying at the recorded source revision reproduces campaign data. At later
revisions, Git/argv metadata differs even when campaign outcomes match; exports
are not expected to be byte-identical across revisions. The portable scripts
were added during review after the recorded batch revision.
