# Balance proposal: rewarding a rounded scion over a one-stat build

**Status:** proposal only. Nothing here is implemented or settled. It responds to finding 1 of the [baseline balance report](balance-report-baseline.md) ("specialist dominance is unchanged") and suggests rule and value changes to test.

**Goal:** a build with one strong Estate and two respectable ones should be the best way to play. A pure one-stat build should be risky or slow, and a perfectly even split need not be optimal either.

## 1. Why specialising wins today

The report shows all three specialists winning at least 99.9% of runs by week 41–50. Five rules cause it, and they compound.

1. **Success is linear in one stat and the off-matchup penalty is mild.** Odds are `stat × multiplier + road bonus`. A second stat only matters once it exceeds half the main stat (`off × 1.5 > main × 0.75`). Until then, +5 in the main stat adds about 5.4 points of success to *every* card (the mean multiplier is 1.08), and +5 anywhere else adds nothing.
2. **Nothing slows the climb.** A lesson always gives +5 for 20 Coin, from 15 to 100. Sixteen lessons max a stat.
3. **The opposing-stat loss taxes only generalists.** A specialist's −1 lands on a stat she never uses (final stats are about 99/17/8). A generalist pays it on a stat she is also trying to raise.
4. **Each Estate protects its own failure pool.** A failed Bellatores approach costs Fatigue, and Bellatores raises the Fatigue ceiling. Oratores does the same for Melancholy. Laboratores failures cost Coin, which Purse Protection halves at high stats and which has no ceiling at all, since she can simply carry more.
5. **The road tests survival, never success.** A failed card still counts toward the segment. With a 75–100 ceiling and a 15-point penalty, she can fail four to six cards per segment and still arrive. Even the finale never asks her to *succeed* at anything outside her Estate.

Two caveats on how large the gap really is:

- The 0% for `balanced` and `pragmatic` is the `trainingReserve` bot artifact the report already describes. With the threshold fixed they win 94–99.6%.
- The remaining gap (win week about 66–74 against 39–48) is partly built into the bots. `balanced` departs when its *lowest* stat reaches 40, so it must buy roughly three times the lessons before its first departure.

So generalists are viable but much slower, and there is no reason to choose them.

## 2. Config-only probes

I ran a quick probe to see whether existing config values can fix this without rule changes. Each cell is 600 campaigns (50 per sign, seed 20261113, paired), on the experimental baseline, with `trainingReserve: 60` for the two generalist bots. This is a small sample, so treat differences of a few points as noise.

"Hard road" is road bonus `[20, 15, 10, 5, 0]`, finale road bonus −30 and 10 finale cards. Cells are win % / mean win week.

| Overlay | specialist-b | specialist-o | specialist-l | balanced | pragmatic |
|---|---|---|---|---|---|
| baseline | 100 / 48 | 100 / 48 | 100 / 39 | 99.7 / 66 | 98.8 / 74 |
| disadvantage 75 → 50 | 100 / 53 | 100 / 52 | 100 / 41 | 99.7 / 66 | 98.8 / 74 |
| disadvantage 75 → 25 | 99.5 / 59 | 98.5 / 58 | 100 / 42 | 99.7 / 66 | 98.8 / 74 |
| opposing loss 1 → 0 | 100 / 48 | 100 / 48 | 100 / 39 | 99.8 / 66 | 99.8 / 63 |
| hard road | 100 / 52 | 100 / 52 | 100 / 42 | 92.8 / 73 | 73.3 / 88 |
| hard road + disadvantage 25 | 96.0 / 65 | 94.8 / 65 | 100 / 44 | 92.8 / 73 | 73.3 / 88 |
| hard road + disadvantage 25 + failure penalty 25 | 33.0 / 79 | 32.0 / 79 | 100 / 52 | 0 (bot) | 0 (bot) |

What this shows:

- **No existing knob fixes it.** A harsher disadvantage multiplier slows the Bellatores and Oratores specialists by 4–10 weeks, but they still win.
- **General difficulty hurts generalists more than specialists**, the same result the report found for the harder finale.
- **Laboratores is immune to everything tried.** It wins 100% even where the other two specialists fall to a third, because Coin is an uncapped and discounted failure pool (cause 4).
- **Removing the opposing loss is free for specialists and worth about 10 weeks to `pragmatic`.**
- The two 0% generalist cells are most likely the bot artifact again: a 25 penalty raises the departure need to 85 Coin, above the reserve of 60. I did not trace it.

The fix therefore needs rule changes aimed at the five causes, not more difficulty.

## 3. Proposals

Listed in the order I would test them. A to D are the recommended package; E and F are supporting options.

### A. Opposing-stat loss only when training her highest stat (cause 3)

A lesson lowers the opposing stat only if the trained stat is already her highest (ties count as not highest). Raising a lagging stat costs nothing extra.

- Theme: over-drilling one discipline crowds out the others; catching up on a neglected one does not.
- Effect: removes the generalist tax and keeps the specialist's. On its own the specialist does not care, but it makes proposal B bite harder.
- Cost: one condition in the tutor rule, plus a config flag so the control is preserved.
- Simpler fallback: set `opposingLoss` to 0, which the probe already supports.

### B. Lessons give less when a stat runs far ahead of her weakest (causes 1 and 2)

Tutor gain depends on the gap between the trained stat and her lowest stat, measured before the lesson:

| Gap to lowest stat | Base gain |
|---|---|
| under 20 | 5 |
| 20–39 | 3 |
| 40 or more | 1 |

Solar and lunar bonuses multiply the reduced gain as usual. Job stat gains stay as they are, so work remains a slow way to push a main stat.

- Theme: the tutor has little left to teach a pupil whose other foundations are missing. The Hedge Knight will not train a commander who cannot read a dispatch.
- Effect: a pure specialist reaches about 35 at full speed and about 50 at reduced speed, then crawls. With proposal A her own lessons also lower the floor, which widens the gap. A shape such as 80/60/45 stays cheap; 100/17/8 becomes very expensive.
- It does not force an even split. A gap of up to 39 still trains at 3 per lesson.
- Cost: a small table in config and one lookup in the tutor rule. The UI must show the expected gain before the player commits.
- Alternative if a relative rule feels opaque: absolute brackets (5 below 50, 4 to 69, 3 to 84, 2 above). This is easier to explain but only delays the specialist (about 24 lessons instead of 16), so I expect it to be too weak alone.

### C. A finale that asks each Estate to succeed (cause 5)

Replace the 8-card survival gauntlet with three **Acclamations**, one per Estate, in an order telegraphed in advance. This follows the design doc's stated plan for a finale that "utilizes skill checks from all three estates".

- Each Acclamation is three cards answered with that Estate's stat. There is no approach choice and no matchup multiplier.
- She must *succeed* on two of the three cards. Failures still cost that Estate's usual resource.
- Failing an Acclamation ends the attempt as a retreat. She keeps her waystations and can try again.
- Theme: the realm crowns her only when those who fight, those who pray and those who work each accept her. For example: the siege line, the cathedral chapter, the city guilds.

Rough odds of clearing all three in one attempt, with a finale road bonus of 0:

| Stats | Per-Acclamation odds | All three |
|---|---|---|
| 100 / 17 / 8 | 99% / 8% / 2% | under 1% |
| 80 / 60 / 45 | 90% / 65% / 43% | about 25% |
| 70 / 70 / 60 | 78% / 78% / 65% | about 40% |
| 80 / 80 / 80 | 90% each | about 72% |

These numbers need simulation. The finale road bonus, the cards per Acclamation and the retry cost are the tuning knobs, and the right values depend on how proposal B changes reachable stats. The point is the shape: a dump stat makes the finale close to impossible, and a modest third stat is survivable with retries.

A lighter version for the regular road: one card in three is a **Trial**, which must be answered with the card's own Estate at a neutral multiplier. This makes the weak stats matter before the finale, but it removes the approach choice on those cards, so I would test the finale change first.

### D. Close the Coin loophole (cause 4, and report finding 2)

Laboratores needs its own fix or it stays the best specialist under any of the above.

- **Cap carried Coin**, for example at 60. A pilgrim's purse is only so large. This gives Coin a ceiling like the other two pools: at 15 per failure, about four failures, the same as a 75 ceiling.
- **Cap Purse Protection on encounter failures at 25%**, keeping the full value for wipeouts. This keeps the settled Q2 rule but halves its strength where it matters most.

Either one may be enough. Test the carry cap first, since it is the simpler rule to explain.

### E. Harsher disadvantage multiplier (cause 1, supporting only)

Lower `matchupPct.disadvantage` from 75 to 50. The break-even for a second stat drops from half the main stat to a third (`off × 1.5 > main × 0.5`), so a modest second stat pays off much sooner. The probe shows it is not enough alone, and it does nothing to Laboratores. It is a config-only change, so it is cheap to include in the test matrix.

### F. A road bonus that rewards the weakest stat (carrot instead of stick)

Replace part of the flat road bonus with `floor(lowest stat / 2)`. For example the first segment becomes `+20 + lowest / 2` in place of `+40`.

- A 15/15/100 scion gets +27 where she got +40. A 45/50/70 scion gets +42.
- Theme: a scion with no blind spots is harder to ambush.
- This is the most visible reward for breadth, and it can be shown on the departure screen. It overlaps with proposal B, so I would pick one of the two as the main lever and not stack both at full strength.

## 4. Measurement changes needed first

The current bots cannot tell us whether any of this works.

1. **Fix the departure thresholds** so the Coin a bot saves is derived from the departure fee, the carry and the failure penalty. Otherwise every penalty or fee change reads as a generalist collapse.
2. **Add hybrid policies**: a "main plus floor" bot (raise one stat, keep the others within a set gap) and a two-stat bot. Today the only choices are one stat or a strict even split, so the simulation cannot find the build we want to win.
3. **Let specialists play their best game**: allow them to choose any approach, so results are not an artifact of forcing the main stat on every card.
4. **Report spread, not just wins**: final stats per policy, and win rate against the gap between highest and lowest stat.

## 5. Suggested test order and success criteria

1. Bot and metric work from section 4, with no rule changes. Re-run the baseline.
2. A alone, then A + B. Check that specialists slow down and hybrids do not.
3. Add D. Check that the three specialists move together and Laboratores loses its lead.
4. Add C. Tune the finale road bonus and card counts.
5. Try E and F as substitutes or supplements if B proves too harsh or too hard to read.

I would call the result a success when:

- the best hybrid policy wins at least as often as every specialist, and at least as early;
- pure specialists win clearly less often, somewhere around 30–60%, so the build is a gamble and not a dead end;
- the three specialists are within about 10 points of each other;
- the strict even split is viable but not the single best build.

## 6. Risks and open questions

- **B and C together may be too much.** B alone already limits one-stat builds, and C alone already punishes a dump stat. Test each alone before stacking.
- **Readability.** A gain that depends on a gap must be shown plainly in the UI, or it will feel arbitrary.
- **Time budget.** If balanced builds need more lessons overall, 96 weeks may be tight. Lesson cost and job income are the levers; the candidate rules already sped generalists up by 10–13 weeks.
- **Approach decides the failure pool** is a settled decision, and I have left it alone. Letting the *threat* decide the pool would attack cause 4 directly, but it removes a real player choice.
- **Items** are disabled in this baseline. The Gambeson and Weighted Coin each reinforce one Estate's own pool, so they should be re-checked once items return.
