The main issues, in priority order:

1. The new bots do not yet guarantee that they test the intended builds.

Readiness is determined by survival probability, while stat targets only influence training when survival is insufficient. A 70/45/30 hybrid could therefore depart and win without developing its secondary or third stat. Conversely, a bot that reaches all targets but still fails its readiness check has no specified next action.

“Whichever stat is furthest below its target, in order main → secondary → floor” is also ambiguous: largest deficit and strict priority produce different builds.

Define whether targets are minimum requirements, ceilings, or preferences. I would separate build investment priorities, departure readiness, and ending qualification, then report achieved stat profiles alongside preset names. Otherwise “hybrid beats specialist” might not actually compare those character shapes.

2. S2 can measure ending eligibility, but its current comparison cannot reliably measure the price of earning it.

Adding victory && min(finalStats) >= 30 is a useful, inexpensive metric. However, changing floorTarget to 30 does not enforce eligibility under the proposed departure logic. The bot might win before meeting it.

Add an explicit ending-seeking policy objective that completes qualification before attempting the finale. Compare that with the same policy without that objective.

   Also distinguish:
   - Eligibility among all campaigns versus among victories.
   - How often a threshold is reached incidentally.
   - The cost of deliberately reaching it.

Reporting thresholds 20/30/40 from identical runs answers the incidental question; measuring their deliberate costs requires separately targeted runs. The metric also does not test the same gameplay as a hard gate—it deliberately avoids that restriction, which is appropriate here.

3. S6 requires success, but does not specifically require breadth.

This is the biggest difference from A’s Acclamations and B’s supporting-stat formula. Requiring five successes still permits earning all five through one highly developed Estate. It could reward specialists’ superior odds more strongly, even while making failure absorption less effective.

That makes S6 worth testing, especially given your interest in it, but frame it as a hypothesis: does requiring successes make switching approaches valuable enough to justify secondary investment?

There is also a factual correction: under the current engine, a week is spent entering a segment, not resolving each card. Additional failures cost resources and extra encounters, not directly calendar time. More weeks arise indirectly through retreats, recovery, and retries.

inally, succ-short only approximately controls encounter count. Expected cards depend on success probability, so it cannot keep road length equivalent for every build.

4. The carry cap and departure-budget rules need to be designed together.

A departure-only cap of 60 does not create an actual purse ceiling: successful encounters add Coin, and continuing along the road can accumulate it. Decide whether this is a packing limit or an on-road capacity limit, including what happens to excess loot.

The budget formula also mixes unlike resources. Bellatores and Oratores failures cost burdens, not Coin; saving Coin based on their worst failure penalty is not necessarily useful. If the desired carry exceeds the cap, the bot needs an explicit fallback rather than waiting forever.

I would include carry amount in policy tuning and test a deliberately wealthy Laboratores strategy. Otherwise the experiment may never exercise the loophole it intends to close. Calling Laboratores “immune” to S4 and S6 is premature: A establishes resilience under its probes, not immunity to the proposed success rule.

5. S5’s isolation experiments need sharper definitions.

Separating gain-only, cost-only, and combined bands is good. But specify where the job-growth cap applies. If every overlay also reduces job gains, “cost-only” is actually two changes.

A clean comparison would isolate tutor gains, tutor costs, and job growth, then combine promising changes. At minimum, include a job-cap-only control.

Specify the complete gap-based table too, including costs and job caps. Also clarify whether jobGainMax caps the base gain before astrology or the final gain afterward.

The increased mastery cost is substantial and intentional. That supports B’s warning: making mastery expensive does not establish that breadth is useful. Measure whether secondary investment improves results at comparable preparation budgets.

6. Do not carry only one stage winner forward.

A disadvantage change that looks weak alone might work well with success-based progress. Selecting a single stage-1 winner could discard useful interactions.

Keep the unchanged baseline plus a small shortlist of promising configurations. When selecting a final package, remove each component once to check whether it contributes. This avoids adopting three rules when one or two achieve the same result.

Run policy tuning before final confirmation, then freeze the selected policies and validate on fresh seeds. Using the fresh seeds to both search and confirm would weaken that confirmation.

7. The success criteria should prioritize build tradeoffs over prescribed losers.

The plan sensibly softens A’s proposed 30–60% specialist win rate. I would go further: treat “specialists below 90% or eight weeks slower” as a diagnostic, not a requirement. A viable specialist need not be deliberately weakened if hybrids become competitive through meaningful advantages.

Compare the speed/reliability frontier across all three leads and include the two-stat builds explicitly. Otherwise the result could favor two skills while leaving the modest third entirely cosmetic.

For statistics, use confidence intervals on paired differences. Overlap between separate intervals is not the appropriate significance test. Alongside winner-only completion times, report the fraction of campaigns won by weeks 50, 60, 70, 80, and 96; this exposes speed and reliability together.

My recommendation is to proceed with B1–B3 and stage 1 after clarifying policy behavior, then implement S5 and S6 only as needed. The current task sequence schedules all three engine changes before the main experiment task, despite the staged reasoning. Making implementation conditional would better preserve the proposals’ emphasis on minimal changes.