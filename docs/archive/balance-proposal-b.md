# Balance proposal: a capable ruler with a chosen strength

## Recommendation

Aim for **one strong Estate, one useful secondary Estate, and a modest foundation in the third**. A martial princess, a learned princess, and a resourceful princess should remain distinct, but neglecting everything outside the chosen path should carry an opportunity cost.

Start with two small experiments: remove tutors' opposing-stat losses and strengthen the encounter disadvantage multiplier. If those cannot close the gap, test a capped secondary-stat contribution to encounter odds. Reserve explicit three-Estate finale requirements for a later, more narrative design.

All numbers below are proposed experiment values, not validated balance results. This document changes no rules or policies. Use `content/rules.experimental.json` as the experiment baseline; shipped `rules.default.json` is the legacy control.

## What the baseline actually establishes

The [baseline report](balance-report-baseline.md) shows a large specialist advantage, but its default-bot win-rate table exaggerates the generalist problem:

- Default Balanced loses every run because its training reserve conflicts with its departure budget. Pragmatic develops the same problem under the Waxing change. This is a policy defect, not proof that balanced characters cannot win.
- With `trainingReserve: 60`, Balanced wins **99.6%** under the candidate, with a **mean** winning week of **65.9**. Pragmatic wins **99.2%**, mean week **73.7**.
- Specialists win essentially every campaign, with candidate **median** winning weeks of **48 / 48 / 41** for Bellatores / Oratores / Laboratores. These are different summary statistics from the generalist means, so they establish a substantial timing concern without supplying an exact comparable speed gap.
- A longer, harder finale leaves specialist victory above 99.9% while reducing adjusted Balanced to 95.4% and Pragmatic to 78.2%. Increasing difficulty alone is poorly targeted.

The desired improvement is therefore mainly **competitive preparation time and meaningful build tradeoffs**, not merely rescuing a zero-win balanced strategy.

## Why concentrating investment pays so well

### One stat buys offense, income, and protection

Encounter odds are `clamp(floor(stat × matchup) + roadBonus + itemBonus, 5, 95)`. The normal matchup multipliers are 1.50 / 1.00 / 0.75. A sufficiently strong Estate remains serviceable even into its counter.

The same Estate improves its job success rate, and successful jobs provide both Coin and more of that stat. Bellatores increases the Fatigue ceiling; Oratores increases the Melancholy ceiling; Laboratores reduces Coin losses. Because the chosen approach also determines the failure resource, specialists usually strengthen exactly the defense they consume.

Importantly, **surviving a failed encounter still advances the segment, including the finale**. Victory does not require winning every roll. Lower odds can therefore be affordable when one stat also supplies a large failure budget. Bellatores and Oratores ceilings already reach 100 at stat 65; Laboratores protection continues increasing to 50% at stat 100.

### Breadth costs more to acquire and maintain

A normal lesson gives +5 to one stat and −1 to another. Three lessons, one in each Estate, produce only +4 each before astrology: +12 total for 60 Coin and three weeks. Removing the losses would produce +15 total, 25% more net growth for that particular rotation.

A specialist can often ignore the opposing loss, eventually flooring the neglected stat at zero. A generalist must repeatedly repair it. The thematic premise that swordsmanship necessarily erodes practical cunning is also weaker than the premise that training consumes time and creates fatigue.

There is an additional measurement bias: generalist bots choose jobs by success probability, so guaranteed Stables beats better-paying jobs even when their expected earnings are higher. Specialist bots use their matching skilled job. Compare improved economic policies before attributing the full speed difference to stats alone.

## Option 1: stop lessons eroding other skills

**First test:** set `classes.tutors.*.opposingLoss` from **1 to 0**, keeping cost 20, gain 5, and existing burdens and astrology.

This is an existing-config change, easy to isolate. Time, Coin, and burdens still make training choices exclusive; breadth no longer carries an additional maintenance tax. It fits an education in complementary responsibilities of rulership.

**Expected effect:** generalists and hybrid builds retain more useful secondary skills. Specialists also retain their starting secondary stats, so this is not a selective specialist nerf and probably will not solve the problem alone.

**Watch:** whether retained starting stats already provide sufficient coverage, leaving further secondary investment unattractive. Do not simultaneously make all lessons cheaper or stronger: that would obscure the effect and accelerate specialists too.

## Option 2: make a counter worth learning

**First test:** change `encounters.matchupPct.disadvantage` from **75 to 50**, with **60** as a milder comparison. Keep neutral 100, advantage 150, Full Moon advantage 200, and the existing road bonuses.

This rewards selecting the right approach rather than simply owning the largest number. At ordinary lunar phases, a countering secondary stat of 34 yields `floor(34 × 1.5) = 51`, exceeding a disadvantaged primary stat of 100 at the proposed 0.50 multiplier. Currently it takes a secondary stat of 51 to exceed that primary's 75. Road bonuses and clamps can erase differences, particularly on the early road.

For illustration, consider a Bellatores-led build in the finale (road −20), outside Full Moon, without items. These are per-roll odds with the best approach, not campaign win rates:

| B / O / L | Bellatores threat | Oratores threat | Laboratores threat | Uniform mean |
|---|---:|---:|---:|---:|
| 100 / 15 / 15, current | 80% | 55% | 95% | 76.7% |
| 100 / 15 / 15, disadvantage 50 | 80% | 30% | 95% | 68.3% |
| 75 / 40 / 40, current | 55% | 40% | 92% | 62.3% |
| 75 / 40 / 40, disadvantage 50 | 55% | 40% | 92% | 62.3% |

The example deliberately shows the limitation: stronger counters narrow the gap but do not necessarily reverse it. These builds also have different total stats and are not equal-week investments. Campaign simulation must include acquisition cost, failure resources, rest, and retries.

**Watch:** Laboratores can still buy through bad matchups, and Full Moon already offers strong counter incentives. Test all three lead Estates and skip-aware policies. Keep threats symmetric initially: globally making one threat more common merely changes which specialist is best. Later, advertised segment-specific mixes could reward preparation, provided the whole route offers comparable challenges to each Estate.

## Option 3: make supporting education improve any approach

Use this if the config-only experiments leave pure specialists dominant. It requires a new rule and config/schema support.

One concrete experiment replaces the stat used for encounter odds with:

```text
support = (min(otherStat1, 40) + min(otherStat2, 40)) / 2
effectiveStat = floor(0.75 × chosenStat + 0.25 × support)
```

Feed `effectiveStat` into the existing matchup/road/clamp calculation. Jobs, training, condition ceilings, and Purse Protection continue to use raw stats. Calculate the support average without intermediate rounding; floor the effective stat once as shown.

A 100/15/15 character has effective primary 78; a 90/40/40 character has 77. The latter also has usable alternative approaches. This is illustrative, not an equal-cost comparison. Secondary skills help up to 40, after which the primary can continue growing: there is no requirement to maintain an equal split.

The thematic interpretation is straightforward: martial leadership needs logistics and judgment; scholarship needs practical experience and resilience; cunning needs authority and understanding. Communicate the supporting contribution in the odds breakdown.

**Watch:** this lowers everyone's effective stats early and may slow the entire campaign. Test independently before combining with stronger counters. If early progress deteriorates, tune the support rule rather than immediately increasing every road bonus. A 40-point support cap can also create a new rigid optimum; compare caps 30/40 and primary weights 75%/85% before choosing a value.

## Option 4: diminish advanced training returns

An alternative to changing encounter calculations is to make basic competence cheaper than mastery:

| Stat before the activity | Tutor base gain | Successful job base gain |
|---|---:|---:|
| Below 40 | 5 | 2 |
| 40–69 | 4 | 1 |
| 70+ | 3 | 1 |

Use the pre-action target stat to select the band, then apply existing astrology and rounding. Retain job Coin payouts. This requires new gain-band rules, not just changing today's flat gain fields.

Apply the rule to job growth as well as tutors, including Stables where applicable, or specialists can bypass advanced lesson costs through paid work. Keep opposing losses at zero when evaluating this as a combined education package.

**Expected effect:** a secondary skill becomes a better use of a week once the primary is already strong. Mastery remains possible, but expensive.

**Watch:** if secondary skills have little practical use, this merely delays the same dominant build. Integer rounding also weakens some astrology bonuses at small base gains. Prefer this only if training efficiency remains a problem after encounters reward breadth; do not stack it with Option 3 in the first experiment.

## Option 5: earn the support of all three Estates

This is the strongest thematic direction for a richer finale, but a larger design change. Becoming ruler requires more than repeatedly surviving the road: military backing, legitimacy, and provisions all matter.

For a small prototype, grant a persistent endorsement for reaching **30** in each Estate, with all three endorsements required to enter the finale. Check and retain endorsements after weekly activities; later stat loss does not revoke them. Show these requirements from the beginning. Earlier pilgrimage segments remain open, and the existing eight-encounter finale remains unchanged after qualification.

The low threshold leaves room for a pronounced specialty. Persistent endorsements also avoid a frustrating last-week loss of eligibility. Narrative names might be the Watch's pledge, the Abbey's recognition, and the Guild's provisions; these are proposed additions, not existing social-track mechanics.

**Watch:** this is a hard breadth requirement, not a soft incentive. Players may simply buy the minimum credentials and return to dumping every point into one stat. It can feel like a checklist, and existing specialist bots will need explicit qualification behavior for a fair comparison. Prefer later quest/social routes to the same endorsements, but keep those outside this initial balance experiment. Skipping encounters should not bypass qualification.

## Laboratores: monitor separately

The candidate's Laboratores specialist finishes earliest, and the report associates its improvement with protection and the Smuggler burden change. Do not reverse these thematic rules merely to force symmetry.

If a Laboratores advantage persists after breadth changes, test capping **encounter-loss** Purse Protection at **30%**, while retaining the existing wipeout-retention formula. At Laboratores 100, an ordinary failure would cost 10 Coin rather than 7; at 60 it would remain 10. This needs a separately configurable encounter cap.

That caps one source of continuing high-stat defense, as burden ceilings already cap for the other Estates. It does not make the resources equivalent: Coin can be stockpiled and earned on the road. Test large-carry and New Moon skip strategies before deciding whether this is necessary.

## Experiment order and acceptance criteria

1. **Establish a fair policy baseline.** Preserve the published bots for historical comparison. Separately add departure-budget-aware saving, expected-income job selection, and skip use. Include pure specialists allowed to choose other approaches, three lead-Estate hybrids, and an even generalist. Existing specialists always choose their own approach; punishing that behavior alone would overstate success.
2. **Run isolated config changes:** opposing loss 0; disadvantage 60; disadvantage 50. Then test the best disadvantage value together with opposing loss 0. Keep the 96-week calendar, route, finale, and item-free setting fixed.
3. **If necessary, test Option 3 independently**, then with the education change. Treat gain bands and endorsements as alternatives requiring separate decisions, not a package to implement automatically.
4. **Investigate remaining Estate asymmetry**, including the optional protection cap. Leave harder finale and item experiments until the basic build incentives work.

Start with the report's 1,000 paired campaigns per sign, all twelve signs, strict invariants, and seed 20261113. Expand close comparisons to 5,000; confirm the selected configuration on fresh seeds. Hold policy behavior fixed within each rule comparison, then separately tune each strategy with the same search budget. A threshold-sensitive policy should not decide the design.

Report victory rate and paired differences, comparable median/mean completion weeks, unfinished campaigns, preparation weeks, stat trajectories, approach use by threat, failures survived, Coin carried, skips, rests, and retreats. Do not use pooled approach shares as evidence of balanced characters: a population of three pure specialists can look balanced in aggregate. Report stat profiles and approach diversity per campaign. Compare completion-time distributions with losses visible, since means among winners can improve simply because slower runs stopped winning.

Suggested design targets, to agree before interpreting results:

- All three lead-Estate hybrid strategies remain reliably viable: approximately **95% or better** victory with competent policies.
- Hybrids with useful secondary investment are competitive with pure specialists: a **five-week or smaller median completion gap** is an initial tolerance, with uncertainty reported. Ideally hybrids gain either reliability or speed in exchange for preparation.
- No single lead Estate consistently dominates both speed and reliability; exactly equal stats are not required to compete.
- Spending weeks improving a neglected secondary skill produces measurable campaign value at a fixed preparation budget, rather than only improving a displayed stat.
- Pure specialization may remain a viable challenge strategy, but it should not be simultaneously the fastest, safest, and simplest solution across all three Estates.

Any implementation should add tests for changed odds and rounding, gain-band boundaries, or endorsement persistence as applicable, and rerun campaign invariants. This proposal itself requires no gameplay changes or simulation claims.

## Sources checked

- [Baseline simulations and policy sensitivity](balance-report-baseline.md)
- [Theme, Estates, education, and intended richer ending](thematic-design-doc.md)
- [Experimental rules](../content/rules.experimental.json)
- [Encounter probability and failure costs](../src/core/encounter.ts)
- [Failure advancement and finale completion](../src/core/pilgrimage.ts)
- [Condition ceilings and Purse Protection](../src/core/conditions.ts)
- [Job and tutor resolution](../src/core/economy.ts)
- [Current policy decisions](../src/simulation/policies.ts)
