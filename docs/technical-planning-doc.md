# The Hidden Scion — Technical Design & Simulation Plan

**Status:** Implementation handoff, pre-PoC (headless rules and balance simulation)  
**Primary language:** TypeScript  
**Future presentation:** React + Vite, with an optional later Godot implementation  
**Source of truth:** Thematic planning document plus subsequent design decisions. Where these disagree, the later decisions in this specification take precedence.

## 1. Purpose and success criteria

Build a **headless, deterministic, testable simulation** of a medieval-fantasy raising simulator. The player, a seneschal, has 96 weekly turns to develop a hidden royal heir and guide her along a pilgrimage to the capital. Progression comes from paid tutoring, jobs, rest, and risk-based pilgrimage segments. Astrology modifies the value/risk of actions. The player wins by surviving a difficult final segment before the deadline.

The first deliverable is **not a playable visual game**. It is a reusable TypeScript game-rules module plus command-line simulation and reports. Subsequent work wraps exactly these rules in a visually polished browser PoC. Prioritize transparent, correct mechanics over architecture for hypothetical feature growth.

### Acceptance criteria

1. A new campaign begins at age 14, on the scion's birthday month, in nominal year **1450**, and has **96 weekly actions** (24 fictional months, four weeks per month). The deadline is her 16th birthday, after week 96.
2. A game-state transition consumes an explicit action and updates turn, money, stats, conditions, inventory, and pilgrimage progress according to deterministic rules and a supplied RNG.
3. A pilgrimage can be started, continued from a waystation, voluntarily retreated from, wiped out of, and eventually completed; all three failure resources are enforced.
4. A final, harder pilgrimage gauntlet is accessible after the regular route and can be retried while weeks remain.
5. Fixed seeds and action sequences produce identical outcomes; invalid actions cannot partially mutate state.
6. Headless bots run thousands of campaigns and export diagnostic results as CSV/JSON, with reproducible seeds and configuration.
7. Core logic does **not** import React, Zustand, DOM APIs, or Node-specific I/O; the simulation adapter can use Node.
8. Tests cover boundaries, stat caps, money accounting, calendar transitions, modifier precedence, and pilgrimage terminal states.

## 2. Scope

**Phase 0 — build now:** state model, pure rules, configurable data, seeded RNG, all weekly economic activities, astrology, pilgrimage, encounter resolution, items, finale, tests, policy bots, batch simulation, analysis/exports. A basic terminal trace is sufficient for debugging.

**Phase 1 — later browser PoC:** React + TypeScript + Vite; visually polished fixed-layout scheduling screen, calendar, character statistics, pilgrimage encounter cards, equipment/consumable choices, outcome/ending screens, sound, local save/load, downloadable/importable JSON saves. No game engine or canvas framework needed for the defined mechanics.

**Phase 2 — deferred:** companion relationships and dialogue, playable NPCs, factions, complex final confrontation, branching endings, festivals, disease/physician, shops, open exploration, and full character-creation depth. No companion or social action is needed in Phase 0. Preserve only minimal identifiers/extension points if cheap; do not implement placeholders that consume calendar time merely to mimic future content.

**Non-goals:** multiplayer, backend, database, in-browser Python, sophisticated ECS, generalized scripting engine, editor tooling, animation system, plugin architecture, or direct TypeScript-to-GDScript portability.

## 3. Canonical game time and campaign state

- **96 weekly action slots**; four weeks per month, 12 months per year; campaign start is birth month/week 1 at the scion's 14th birthday. Age 16 marks the deadline. Display year 1450 at start; the fictional four-week calendar is **not** a real Gregorian date calculator.
- Store `elapsedWeeks: number` in range 0–96. Derive `monthOffset = floor(elapsedWeeks / 4)`, `weekOfMonth = elapsedWeeks % 4`, `yearOffset = floor(monthOffset / 12)`. Zodiac chosen at creation determines birth month and first displayed month. Solar aspects use `(currentMonth - birthMonth + 12) % 12`.
- A normal home activity consumes one week. Pilgrimage **segment entry** consumes one week, regardless of whether the segment ends in completion, retreat, or wipeout. Continuing to a next segment consumes another week. Returning safely from a waystation costs no **additional** week. Retreat costs no **additional** week. Wipeout incurs **one extra convalescence week**, if available.
- Do not allow a new segment when `elapsedWeeks >= 96`. A segment entered in week 96 may finish during that week; a result that requires extra convalescence is bounded by the deadline. Terminal victory/failure takes precedence over any further action. Allow retry of final gauntlet from its unlocked checkpoint while time remains.
- Suggested initial state: `bellatores=15`, `oratores=15`, `laboratores=15`, then **+5** to the Estate determined by birth sign; `fatigue=0`, `melancholy=0`, `treasury=50`, route checkpoint 0, zero carried Coin, empty equipment/consumable inventory. Stats are clamped to `[0,100]`; treasury to `[0,9999]`.

### Zodiac groups

- **Cardinal → Bellatores:** Aries, Capricorn, Libra, Cancer.
- **Fixed → Oratores:** Leo, Taurus, Aquarius, Scorpio.
- **Mutable → Laboratores:** Sagittarius, Virgo, Gemini, Pisces.

The birth sign must affect both the +5 initial Estate and the timing of monthly solar aspects; evaluate all 12 signs in simulation.

## 4. Condition mechanics

Fatigue and Melancholy represent **accumulated negative burdens**. Both begin at 0. Reaching their *current derived ceiling* causes collapse; they are not positive health bars.

```text
fatigueCeiling   = clamp(floor(75 + (bellatores - 15) / 2), 75, 100)
melancholyCeiling = clamp(floor(75 + (oratores - 15) / 2), 75, 100)
```

Ceilings are computed from current stats whenever required; they are never separately mutated. The `floor` handles half-point ceilings consistently with integer mechanics. Negative burden changes floor at zero. If a stat reduction lowers a ceiling below the existing burden, apply the same collapse logic when resolving that action.

**At home:** hitting either ceiling triggers a mandatory one-week rest/convalescence period, not the pilgrimage's financial and carried-loot penalties. **Provisional implementation rule:** forced home convalescence consumes the next available week and reduces both burdens by 15 (as Rest at Home), rather than repeatedly chaining collapse. Explicitly surface this provisional rule in configuration and test it. If this behavior has not been approved, do not present it as a finalized design decision.

**On pilgrimage:** hitting either ceiling causes immediate wipeout; see §8. **Financial wipeout** is separate: when a Laboratores encounter penalty would exceed remaining carried Coin, it causes the same pilgrimage wipeout without allowing a negative carried balance. Exactly zero remaining Coin is legal if the penalty was fully payable.

## 5. Economy and weekly home activities

All purchases/fees require enough **treasury Coin** unless an explicitly defined capped loss is involved. Invalid unaffordable activities do not consume time. A normal action updates state once and advances one week. Apply caps and floors consistently.

### Tutoring (classes)

| Tutor | Target stat | Base change | Opposing stat change | Cost | Burden |
|---|---|---:|---|---:|---|
| Hedge Knight | Bellatores | +5 | Laboratores −1 | 20 | +5 condition |
| Hermit | Oratores | +5 | Bellatores −1 | 20 | +5 condition |
| Smuggler | Laboratores | +5 | Oratores −1 | 20 | +5 condition |

**Still unspecified:** which burden(s) each tutor raises by +5. Do not bury an arbitrary choice in code; define a `tutorBurden` configuration map and mark the values **TBD**. For initial runs, a candidate baseline is Hedge Knight +5 Fatigue, Hermit +5 Melancholy, Smuggler +5 Fatigue/+5 Melancholy; these are explicitly **simulation assumptions, not settled rules**. Require them to be visible in report metadata.

### Jobs

For all jobs except Stables, success probability is `clamp(relevantStat + 35 + flatBonuses, 5, 95)%` (d100). Stables always succeeds. Apply solar lunar modifiers as described in §6. XP/stat growth only occurs on success.

| Job | Stat | On success | On failure |
|---|---|---|---|
| Stables | — | +6 Coin, +1 Laboratores, +2 Fatigue, +2 Melancholy | Never fails |
| Alehouse | Laboratores | +(10 + d10) Coin, +2 Laboratores, +5 Fatigue | +0 Coin, +5 Fatigue, +5 Melancholy |
| Village Watch | Bellatores | +15 Coin, +2 Bellatores, +5 Fatigue | +0 Coin, +10 Fatigue |
| Scriptorium | Oratores | +15 Coin, +2 Oratores, +5 Melancholy | +0 Coin, +10 Melancholy |

### Rest

| Activity | Cost | Burden reduction |
|---|---:|---|
| Rest at Home | 0 | −15 Fatigue and −15 Melancholy |
| Bathhouse | 15 | −40 Fatigue and −10 Melancholy |
| Shrine | 15 | −10 Fatigue and −40 Melancholy |
| Banquet | 30 | −35 Fatigue and −35 Melancholy |

The banquet costs 15 in Solar Return month. Waning Moon multiplies purchased rest reductions by 1.5. **Interpretation to confirm:** Waning applies to Bathhouse/Shrine/Banquet, not Rest at Home (source explicitly names the three paid actions). Prefer configuration over a hidden assumption.

### Rounding and modifier order

Default: **floor to integer**, never bank fractional stats. Apply flat success-probability bonuses before clamping to 5–95; apply percentage multipliers to the corresponding **base payout / gain / condition delta**, then floor once per resulting quantity. Define explicit precedence (and test combinations):

1. Validate eligibility and sufficient funds.
2. Determine current solar/lunar aspects and applicable modifiers.
3. For chance-based actions, compute final probability, clamp, and roll; choose success/failure result.
4. Apply gains/costs/burdens with configured multiplier product, floor **once** for each result; for negative changes or decrements, first compute the nonnegative magnitude, floor, then subtract.
5. Clamp stats/burdens/coin; test collapse.
6. Advance calendar once; resolve mandatory convalescence if triggered; test deadline.

Any different order must be a consciously approved rules change, not an incidental implementation detail.

## 6. Astrology

### Solar: 4-week monthly modifiers based on birth month

| Angular distance from birth month | Effect |
|---|---|
| 0 — Solar Return | Tutor stat gain ×1.2; Banquet cost ×0.5 |
| 6 — Opposition | Job-generated Fatigue and Melancholy ×1.5 |
| 4 or 8 — Trine | Job success chance +15 **percentage points** |
| 3 or 9 — Square | Tutor stat gain ×1.3; tutor-generated Melancholy ×2 |
| Other months | No solar modifier |

### Lunar: one phase per week, cycles every four turns

| Week | Phase | Effect |
|---|---|---|
| 1 | New Moon | Bonus to Smuggler/Alehouse; optional pay-to-skip one encounter per route segment |
| 2 | Waxing Moon | If the **same named job or class** was performed the preceding week, payout/stat gain ×1.1 |
| 3 | Full Moon | Bellatores/Oratores activities surge; advantage multiplier becomes ×2.0 rather than ×1.5; failed pilgrimage Fatigue/Melancholy penalties ×2 |
| 4 | Waning Moon | Bathhouse/Shrine/Banquet recovery magnitudes ×1.5 |

**Missing values to resolve or configure before full balancing:** New Moon activity bonus magnitude, encounter skip fee, Full Moon home activity surge magnitude, stacking versus single-application interpretation of Waxing, and whether lunar effects are locked at **segment entry** (recommended, as a single segment is one week). Do not treat unassigned values as canon. For a minimal baseline, provide zero/off defaults for unspecified bonuses and label simulations as *partial astrology*, then enable and re-run once parameters are set. Waxing should only apply once to the immediately prior week's identical activity unless the rule is later changed.

## 7. Pilgrimage model and encounter rules

### Route model

- Route consists of configurable regular segments/waystations followed by one final gauntlet; **suggested initial balance configuration:** 5 regular segments, 5 encounters each, and 8 final encounters. These are **test parameters**, not settled canon.
- `furthestWaystation` is a durable checkpoint, never rolled back by retreat/wipeout. A new pilgrimage begins at that checkpoint; the unfinished segment is replayed from its beginning.
- Entering a segment consumes one week. A new pilgrimage **from home** pays a 10-Coin preparation fee from the treasury, then selects an amount of Coin to carry. Continue immediately from a newly reached waystation without additional preparation fee, consuming an additional week. Return safely to home at a waystation at no further weekly cost.
- **Accounting rule:** distinguish `treasury` and `carriedCoin`. At departure, deduct `departureFee + carriedAmount` from treasury (do not double-charge the fee); on a safe return deposit the remaining carried Coin and earned Coin into treasury. Keep this separation visible to bots and UI.
- Road bonus decreases by regular segment, from **+40** on first to **+0** on last, linearly (for 5 segments: +40,+30,+20,+10,+0). The final gauntlet has a **configurable negative road bonus** (suggest −20 as an initial test value, not canon).
- A segment consists of exactly N encounters. A success or a failure **always advances the encounter count**, unless the failure causes an immediate wipeout. No rerolling the same encounter until success.
- After every resolved nonterminal encounter, player can **continue** or **retreat**. At segment completion, checkpoint advances and player can return home or continue into next segment (if time permits). Final gauntlet completion is immediate victory.

### Estate matchups

- Bellatores beats Laboratores.
- Laboratores beats Oratores.
- Oratores beats Bellatores.

Each encounter declares a threat Estate (colored rubricated card). The player picks an approach Estate, whose own stat determines the roll and whose resource absorbs the penalty on failure.

```text
multiplier = 1.5 if chosen approach beats threat
           = 1.0 if same Estate
           = 0.75 if threat beats approach
           = 2.0 if advantage during Full Moon

successProbability = clamp(
  floor(chosenStat * multiplier + roadBonus + flatItemBonuses),
  5, 95
)
```

Roll an integer 1..100; success iff `roll <= successProbability`. Use the **pre-roll probability** for explanations and simulation diagnostics. The Saint's Relic bonus should be interpreted as +10 to **success probability** against an Oratores-coded threat; this aligns with the intent to aid the roll-under check. If the design genuinely means +10 to the actual die result, that would worsen success and must be clarified.

On success: advance; award **1d4 Coin** to carried Coin (temporary segment/run loot until safely banked). Later replace/add card-specific rewards, items, and modest condition relief. On nonfatal failure: advance; Bellatores adds **15 Fatigue**, Oratores adds **15 Melancholy**, Laboratores deducts **15 carried Coin**. Full Moon doubles Fatigue/Melancholy damage, **not Coin loss** per source. The selected approach determines damage type, independent of encounter color.

**Encounter generation:** uniform random threat Estate as initial test distribution; record every drawn card. Card counts/types and nonuniform distributions must be configurable for later anti-specialization testing. Do **not** dynamically counter the player's current build by default.

### Retreat, waystation and wipeout

- **Safe arrival:** After all N encounters, unlock new waystation; keep provisional Coin and loot, bank on return. May immediately continue to next segment at one additional week without a new preparation fee, or return home for free in time terms.
- **Voluntary retreat before segment completion:** current week's segment time remains spent, partial segment encounter progress is lost, no extra convalescence week. For source-described loss of a *portion of run-specific loot* and a *Coin toll*, magnitudes are still **TBD**. Put `retreatLootRetention` and `retreatToll` in configuration, label their values experimental, and report their values. If no values are approved, make baseline `retreatLootRetention=0.5`, `retreatToll=5` solely for simulation exploration, with floor rounding and money never below zero; do not present as final rules. Clarify whether pre-existing carried Coin is protected from the loot forfeiture (recommended: yes; only the earned Coin/loot is reduced).
- **Wipeout trigger:** Fatigue at/above ceiling; Melancholy at/above ceiling; or attempted Laboratores cost exceeds carried Coin. The failed segment is abandoned; its partial progress and all unbanked rewards are lost. Carried consumables are lost; equipment is preserved. For carried Coin, apply Purse Protection multiplier to the **nonnegative amount remaining immediately before the lethal cost**; do not first charge a deficit into negative territory. Ordinary carried Coin is lost unless protected.
- **Wipeout fees:** deduct up to **50 Coin from treasury**, floored at zero, with no debt. Impose **one additional convalescence week**, bounded by campaign deadline. The source's post-collapse condition recovery amount is unspecified: set this in configuration and mark **TBD**; a provisional reset-to-0 of Fatigue and Melancholy is convenient for the first simulation, but it is **not** a finalized rule.
- **Purse Protection:** item/effect multiplier specified as a design hook, not yet fully defined. Weighted Coin currently halves *failed Laboratores encounter Coin loss*, but does **not** automatically protect all carried Coin on wipeout unless explicitly approved. Keep these effects separate: `laboratoresPenaltyMultiplier=0.5` vs. `wipeoutCoinRetentionMultiplier`.
- **Time exhaustion:** victory succeeds only if the final encounter completes during an allowed week. Ending the campaign without victory is a terminal deadline failure.

### Equipment and consumables

At most **one equipment item and one consumable** may be taken when leaving home for a pilgrimage session; the carried item selection persists across continued segments until used/lost/returned. Items are rare, not sold in shops. For baseline simulations, make item acquisition disabled or use a clearly labeled test reward table until actual drop rates are decided.

| Item | Type | Effect |
|---|---|---|
| Theriac | Consumable | Reduce Fatigue by 30 during pilgrimage |
| St. John's Wort | Consumable | Reduce Melancholy by 30 during pilgrimage |
| Metheglin | Consumable | Reroll a failed encounter check; use immediately after seeing failure, before its penalty is committed |
| Gambeson | Equipment | Reduce failed Bellatores Fatigue penalty by 5 |
| Saint's Relic | Equipment | +10 success-probability points versus Oratores threats |
| Weighted Coin | Equipment | Halve failed Laboratores carried-Coin penalty; floor the penalty magnitude after multiplication |

Consumables usable between encounters, with Metheglin only at the post-failed-roll reaction window. Resolve rerolls against the same revealed encounter/approach, without paying the penalty for the first roll. If reroll fails, apply the usual failure consequences. No consumable use after a wipeout has already been committed. Preserve equipment on wipeout, but return it to inventory. Define how lost consumables are tracked; items already consumed must not be lost twice.

## 8. Final gauntlet and victory

- Unlock once all regular segments are secured. It uses the **same encounter protocol**, with a higher configurable encounter count and negative road bonus.
- It may be attempted repeatedly, beginning at the final checkpoint each new session, as long as the campaign has remaining weeks.
- Completion of all its encounters without collapse is **victory**. No special boss mechanics or multiple endings in Phase 0.
- Treat the finale's success as the result of an entered segment; victory can occur in the final permitted week. No post-victory week is consumed.

## 9. State and rules API

Suggested plain data types (adapt during implementation; keep data JSON-compatible):

```ts
type Estate = 'bellatores' | 'oratores' | 'laboratores';
type Phase = 'home' | 'pilgrimage' | 'victory' | 'defeat';
type PilgrimageStage =
  | 'encounter_reveal'
  | 'choose_approach'
  | 'reroll_or_accept'
  | 'continue_or_retreat'
  | 'waystation_decision';

interface CampaignState {
  version: 1;
  seed: number;
  rngState: number; // exact state of chosen deterministic RNG
  birthSign: string;
  elapsedWeeks: number;
  stats: Record<Estate, number>;
  fatigue: number;
  melancholy: number;
  treasury: number;
  inventory: Record<string, number>;
  furthestWaystation: number;
  phase: Phase;
  pilgrimage?: {
    stage: PilgrimageStage;
    segmentIndex: number;
    encounterIndex: number;
    carriedCoin: number;
    departureCarriedCoin: number;
    earnedCoin: number;
    equipmentId?: string;
    consumableId?: string;
    currentThreat?: Estate;
    currentApproach?: Estate;
    lastRoll?: number;
    lastProbability?: number;
    pendingFailure?: boolean;
  };
  lastWeeklyActivityId?: string;
  outcome?: 'victory' | 'deadline';
}
```

Use a tagged union of actions (`TRAIN`, `WORK`, `REST`, `BEGIN_PILGRIMAGE`, `CHOOSE_APPROACH`, `USE_CONSUMABLE`, `ACCEPT_RESULT`, `CONTINUE_ENCOUNTER`, `RETREAT`, `RETURN_HOME`, `CONTINUE_SEGMENT`) and validate each against game phase. An event log (`week_spent`, `stat_changed`, `job_failed`, `encounter_drawn`, `encounter_resolved`, `waystation_reached`, `wipeout`, `victory`) enables debugging, analytics, and later UI animation/sound triggers.

Preferred functions:

```ts
createCampaign(options, rulesConfig): CampaignState
getAvailableActions(state, rulesConfig): GameAction[]
applyAction(state, action, rulesConfig): {
  state: CampaignState;
  events: GameEvent[];
}
getDerivedStats(state, rulesConfig): DerivedStats
getCalendar(state): CalendarInfo
```

`applyAction` must be deterministic given state (including RNG state), action and rules configuration. Do not call `Math.random()` or `Date.now()` in rule logic. Use a small documented seeded PRNG (such as Mulberry32 or xorshift32), and implement stable integer d4/d10/d100 draws. Tests should fix expected draws/sequences for reproducibility. Reject invalid actions with typed errors and leave the input state unchanged.

To prevent irreproducible coupling among random decisions, consider independent named RNG streams (jobs, encounters, rewards) derived from a master seed; if this is too much for Phase 0, use one seeded stream and document that paired-seed comparison is approximate when policies consume different numbers of rolls.

## 10. Configuration and unresolved defaults

All tunable game parameters live in one typed rules configuration with a serializable snapshot/hash included in every simulation report. Do not scatter magic numbers across files. Organize `calendar`, `startingState`, `classes`, `jobs`, `rest`, `astrology`, `encounters`, `route`, `failure`, and `items`.

**Confirmed values:** 96 weeks; 4 weeks/month; start at age 14/year 1450/birth month; +5 Zodiac bonus; stat 0–100 and treasury 0–9999; initial stats 15, treasury 50, burdens 0; activity values listed above; 10 Coin pilgrimage departure; 15 base encounter penalty; 1d4 success Coin; 50 max treasury medical fee; one extra wiped-out week; carry one equipment/consumable; 5–95% roll clamp; floor rounding; regular segment completion persists as checkpoint.

**Not yet confirmed (must be recorded in simulation metadata):** number of segments, final N, final negative road bonus, tutor burden mapping, New/Full Moon home activity bonuses, New Moon encounter skip fee, retreat toll and loot retention, exact convalescence recovery, starting item/drop rates, whether automatic home collapse forces a week, details of purse protection, and explicit carry/toll accounting on retreat. Set a documented experimental baseline for simulations but do not label these rules approved.

## 11. Simulation bots

All bots use `getAvailableActions()` and `applyAction()`; none mutates game state directly. Start with five policy families, with specialist subvariants:

1. **Stables-only baseline:** work Stables, rest whenever near collapse; never intentionally pilgrimage. Tests economic accumulation and condition ceiling enforcement, not victory.
2. **Greedy specialist (B/O/L):** prioritize tutoring/job actions in one Estate; use that Estate when possible during encounters; recover and attempt pilgrimages by simple thresholds. Tests specialization viability and degenerate strategies.
3. **Balanced:** keep stats close; work for money, study the weakest stat, rest as needed, use advantageous/least-risk encounter approaches. Tests balanced development.
4. **Reckless pilgrim:** attempt segments early, continue at high risk, retreat only when forced/imminent, avoid preparation. Stress-tests wipeouts and time loss.
5. **Pragmatic pilgrim:** heuristic plan balancing training, earnings, recovery, carried money, and segment risk; attempt progression at sensible thresholds and retreat according to estimated survivability. Tests whether an ordinary goal-directed policy can finish.

Bots may use **observable** state and probabilities, but not future RNG outcomes, unseen encounters, or hidden information. Implement strategy thresholds as CLI/config parameters. Keep a simple reproducible decision trace for any seed.

### Batch plan

- Development smoke tests: 100–200 campaigns/policy; verify invariants and logs.
- Initial evaluation: **1,000 campaigns per policy per birth sign**. Run specialists B/O/L as separate policy variants; report them separately. Birth month matters to astrology even when birth-sign initial stat bonuses are identical.
- Repeat with 5,000+ per setting only when variance matters or comparisons are close.
- Compare 48- and 96-week campaigns as a sensitivity experiment if useful, but **96 weeks is the canonical PoC length**.
- Vary route length (e.g. 4/5/6 segments), road bonus curve, final gauntlet parameters, and special item availability via named configuration variants. Do not silently adjust rules between bots.

## 12. Metrics and reports

Per run record: seed, birth sign, policy, rules config identifier, winner/deadline, final week/age, final stats, burdens/ceilings, treasury, reached checkpoint, final encounters completed, total job/tutor/rest weeks, weeks in pilgrimages, number of segment starts/retreats/wipeouts, convalescence weeks, job success rates, encounter rates by threat/approach, Coin earned/spent/lost by source, and item acquisitions/uses/losses.

Aggregate by policy and sign:

- Victory rate with uncertainty bounds and median victory week among winners.
- Distribution of furthest waystation reached; week first reaching each checkpoint.
- Bankruptcy/zero-treasury frequency, failed departure attempts, medical-fee shortfall frequency.
- Wipeout causes (Fatigue, Melancholy, Coin), retreats, forced convalescence, condition levels by week.
- Final stat distributions and effective encounter success probabilities; approach selection frequency and comparative advantage/disadvantage counts.
- Calendar utilization: fractions of weeks training, earning, resting, adventuring, convalescing, unused.
- How often terminal failure is caused by deadline versus a resource loop.

Deliver `runs.csv` (one row per run), `summary.json`, `summary.md` (human-readable tables and interpretation), and optional `events.ndjson` for selected debug seeds. Include CLI commands and a `--trace-seed` mode to reproduce one campaign.

## 13. Tests and invariants

Use Vitest (or Node's built-in test runner) for fast unit and integration tests.

**Core invariants:**

- Stats and condition burdens are always valid integers; stats in 0–100; treasury/carried Coin never negative; treasury ≤9999.
- Condition ceilings follow stats, including the initial zodiac bonus; `fatigue >= ceiling` or `melancholy >= ceiling` never persists in a normal, interactable state without immediate resolution.
- Weeks never decrease or exceed 96; entering a segment consumes exactly one week, retreat none extra, wipeout at most one extra.
- Invalid or unaffordable actions consume no week, no item and no RNG draw.
- Identical `(seed, initial state, configuration, actions)` yields identical state and events.
- Both successful and failed nonfatal encounters advance the encounter index exactly once; reroll does not advance twice.
- The last encounter of a segment unlocks one checkpoint; returning/restarting never regresses it.
- Treasury and carried Coin transfers conserve total Coin except documented fees, rewards and losses.
- Inability to cover Laboratores penalty triggers financial wipeout and never enters negative Coin; equality to penalty is survivable.
- Wipeout financial fee is min(50, current treasury), never producing debt; equipment preserved, consumable forfeited, provisional loot lost.
- Full Moon doubles only pilgrimage Fatigue/Melancholy failure costs, unless rules are explicitly changed.
- Final victory may happen in week 96; continuation after deadline is forbidden.
- Applying configured modifiers before probability clamp, and applying integer floors once, produces expected results in known combinations.

Add deterministic scenario tests: empty purse; 1 Coin short of a failure; both conditions near ceiling; successful final encounter on last week; wipeout on last week; equipping Weighted Coin; relic versus Oratores encounter; a failed roll rerolled with Metheglin; birthday crossing year boundary; two consecutive weekly activities under Waxing Moon.

## 14. Suggested repository structure

```text
hidden-scion/
  package.json
  tsconfig.json
  README.md
  content/
    rules.default.json
    rules.experimental.json
    encounters.json             # optional concrete cards, initially generated types
    items.json
  src/
    core/
      types.ts
      config.ts
      calendar.ts
      astrology.ts
      economy.ts
      conditions.ts
      pilgrimage.ts
      items.ts
      rng.ts
      reducer.ts               # main action/transition boundary
      derived.ts
    simulation/
      policies.ts
      runner.ts
      metrics.ts
      cli.ts
    tests/
      *.test.ts
  reports/                     # gitignored generated output
  web/                         # deferred to Phase 1
```

Suggested commands:

```bash
npm install
npm test
npm run typecheck
npm run sim -- --policy pragmatic --birth-sign aries --seed 123 --trace
npm run sim -- --all-policies --all-signs --runs 1000 --out reports/baseline
```

Node 20+ and modern TypeScript; no server or database. Use a lightweight CLI arg parser or straightforward built-in argument parsing. `package-lock.json` committed. Keep baseline runs deterministic across platforms by avoiding floats for intermediate persistent state and defining rounding precisely.

## 15. Implementation order

1. **Create config, type definitions, seeded RNG and tests.** Resolve all critical TBD fields as explicit *experimental defaults*; no hidden constants.
2. **Implement calendar, condition ceilings, home activity resolution, and astrology.** Test boundaries and modifiers.
3. **Implement route checkpointing and pilgrimage encounter state machine.** Test travel-week charging, bank/carried Coin separation, RPS and success rolls, retreat and wipeout.
4. **Implement items and final gauntlet.** Test rerolls, item loss, and victory/deadline logic.
5. **Implement bots and detailed event/metric collection.** Ensure every policy uses production action API.
6. **Run exploratory batches, inspect traces, revise only configuration values first.** Write a brief baseline balance report documenting defects and hypotheses.
7. **Only then start the React presentation PoC** using the same core module. Implement save/load using JSON and local browser storage, add polished woodcut artwork, typography, audio, and narrative later.

## 16. Deliverables checklist

- [ ] TypeScript project builds and typechecks.
- [ ] Self-contained core rules API, JSON-compatible state, deterministic RNG.
- [ ] Configurable values and explicit unresolved-parameter register.
- [ ] Calendar, astrology, tutoring, jobs, rest, conditions.
- [ ] Segment-based pilgrimage with threat/approach, resource damage, checkpointing, retreat/wipeout, Coin transfer, items.
- [ ] Repeatable final gauntlet and campaign ending.
- [ ] At least five policy families (including three specialist variants).
- [ ] CLI single-run trace and batch mode across 12 birth signs.
- [ ] Reproducible CSV/JSON/Markdown reports.
- [ ] Comprehensive unit/integration tests and README with exact commands.

**Implementation principle:** Where the thematic document lacks an exact numerical value or contradicts subsequent decisions, do not silently invent a canonical rule. Use the latest explicit decision, surface the unknown as configurable, document any simulation-only assumption, and keep the default rule set auditable.