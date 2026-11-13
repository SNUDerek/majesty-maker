# The Hidden Scion — UI Technical Plan (Playtest PoC)

**Status:** planning, ready to implement
**Derived from:** [ui-handoff.md](ui-handoff.md) (design intent), the rules engine in `src/core/` (authoritative), and an audit of `assets/`.
**Goal:** the smallest browser UI that lets a person play a full 96-week campaign to test gameplay, and doesn't look horrendous. Polish, audio, transitions and pitch-quality composition come later.

Where this plan and the handoff disagree, this plan narrows scope for the playtest build. Where either disagrees with `src/core`, the engine wins.

---

## 1. Scope

### In (playtest build)

- Title → (skippable) intro → name + birth sign → Home.
- Home hub with date, astrology, stats, conditions (current vs ceiling), treasury, route progress.
- Tutor / Job / Rest: pick → preview → confirm → result → Home.
- Pilgrimage: preparation (carry Coin, item slots if any) → encounter loop → waystation / retreat / wipeout → final gauntlet → victory / deadline defeat.
- Autosave + continue; three manual save slots.
- Keyboard-operable buttons, visible focus, readable at 1280×720.
- A dev panel (hidden behind `?dev`) for seed, config choice and a raw state/event dump.

### Out (deferred)

Audio, animation beyond short CSS fades, Settings beyond a "reset save" button, Credits screen content (a static list is fine), social, shop, Character/Inventory as separate overlays (folded into the Home side panel), map screen (route strip instead), responsive/mobile layouts, encounter illustrations.

---

## 2. Decisions (resolves handoff §10)

| Question | Decision |
|---|---|
| Layout / scaling | Fixed **1280×720 logical stage**, scaled to fit the window with CSS `zoom` (keeps text re-rasterised and crisp; supported in all current browsers), letterboxed on a dark surround. All UI measurements are in logical px. Backgrounds are 1920×1080 and drawn with `background-size: cover`. |
| Calendar / Inventory / Map | No separate screens. Calendar + astrology live in the Home header; inventory is a small list in the Home side panel; the route is a strip widget reused on Home, Prep and Encounter. |
| Result data | **Events** returned by `applyAction` drive result panels (`GameEvent[]` already carries every delta with a source tag). No before/after diffing. |
| Save points | Any state. `CampaignState` is plain JSON including RNG streams, and the screen is derived from it (§5.2), so loading mid-pilgrimage just works. Autosave after every successful action. |
| Typography | Body: **IM Fell English** (`assets/fonts/im-fell-english`; the handoff's "DW Pica" is not in the repo — see §11). Headings: **Canterbury**. Title wordmark only: **Carrick Caps**. Numbers in stat blocks use body font with `font-variant-numeric: tabular-nums` (falls back gracefully if unsupported). |
| Audio | None in this build. |
| State library | None. A small store built on `useSyncExternalStore` (§5.3). |
| Rules for previews | A new pure, additive `src/core/preview.ts` (§4.2). The UI never re-implements probability or cost formulas. |

---

## 3. Asset audit

### 3.1 What exists and where it is used

| Asset | Files | Use |
|---|---|---|
| Title | `misc/title_1920x1080.webp` | Title screen; victory / defeat backdrop. |
| Backgrounds | `backgrounds/background_{home,school,job,pilgrimage,waystation,capital}_1920x1080.webp` | Home + Rest (home, with a darker scrim for Rest); Tutoring (school); Work (job); Prep / Encounter (pilgrimage); Waystation (waystation); Final Gauntlet encounters (capital). `waystation` and `capital` are temporary copies of the pilgrimage and title images, to be overwritten. |
| Parchment | `misc/parchment_1600x1080.webp` | Texture for large panels (side panel, preview, result) and the intro text box. |
| Intro panels | `misc/intro_panels/intro_{01A,01B,02,03,04A,04B,04C,05,06,07,08}_1024x768.webp` | Intro sequence; 04B is skipped per the handoff text. |
| Zodiac | `misc/zodiac_signs_905x720.webp` (4×3 grid) | Sign picker and Home date block, via CSS sprite (§3.3). |
| Moon | `misc/moon_phases/*.png` (8 phases, 256²) | Engine has 4 phases; map `new→moon_new`, `waxing→moon_first_quarter`, `full→moon_full`, `waning→moon_third_quarter`. |
| Princess | `portraits/main_princess_360x720.webp` (transparent) | Home, full height on the left. Character setup. |
| Tutors | `portraits/portrait_{hedge_knight,hermit,smuggler}_right_360x540.webp` | Tutor cards / preview panel. |
| Princess headshot | `portraits/portrait_princess_right_360x540.webp` (temporary copy of the damsel portrait) | Pilgrimage HUD, save slots. |
| Other portraits | `portrait_{damsel,lady,queen,merchant_male,noble_male,student_male}_right_360x540.webp` | Merchant → Alehouse card, noble → Banquet, student → Scriptorium, queen → intro/credits only. |
| Estate icons | `items/icon_{sword,book,hammer}.png` (32²) | Bellatores / Oratores / Laboratores everywhere. Render at 32 or 64 with `image-rendering: pixelated`. |
| Items | `items/item_{theriac,st_johns_wort,metheglin,gambeson,saints_relic,weighted_coin}.png` | One per item id in `content/items.json`; filename = `item_<id>.png`. |
| Coin | `items/gold/gold_pile*.png` | `gold_pile.png` as the Coin glyph; pick a larger pile for big amounts if cheap (optional). |
| UI pack | `ui/PNG/*` (Kenney RPG, CC0) | Panels (100×100), long buttons (190×49), bars (9/18×18 caps + mid), arrows, check/cross icons. |
| Fonts | `fonts/{canterbury,carrick-caps,im-fell-english,junicode,blackchancery}/*.woff2` | §2. |

### 3.2 Style note on the Kenney pack

The pack is bright and cartoony; the art is watercolour/woodcut. To keep it from clashing: use only the **beige / beigeLight / brown** panels and **brown / beige / grey** buttons; skip the blue variants; never place a Kenney panel directly over a busy background without the parchment fill. The bars are fine as-is.

### 3.3 Technical notes

- **9-slice:** panels are 100×100 with ~8 px rounded borders. Use `border-image: url(panel_beigeLight.png) 12 fill / 12px stretch;` as a starting point and verify corners at 1× and 1.5× zoom. Buttons (`buttonLong_*`, 190×49) use `border-image-slice: 12 16` so they stretch horizontally.
- **Bars:** three-part (`*_horizontalLeft` 9 px, `*_horizontalMid` 18 px, `*_horizontalRight` 9 px). Implement as a flex row: left cap, mid with `background-repeat: repeat-x` and `width: N%`, right cap. (The pack's misnamed `barBlue_horizontalBlue.png` has been renamed to `barBlue_horizontalMid.png`.)
- **Zodiac sprite:** the grid isn't perfectly regular. Use `background-size: 400% 300%` and `background-position: calc(col * 33.333%) calc(row * 50%)` with a cell box of 226×240 and slight `object-fit`-style cropping; if a sign looks clipped, crop the sheet into 12 files instead (one-time, keep the original).
- **Order on sheet:** row 0 aquarius, pisces, aries, taurus; row 1 gemini, cancer, leo, virgo; row 2 libra, scorpio, sagittarius, capricorn.
- **Asset registry:** `src/ui/assets.ts` imports each used file explicitly (`import homeBg from '../../assets/backgrounds/…webp'`) and exports maps keyed by content id (`ESTATE_ICON[estate]`, `TUTOR_PORTRAIT[tutorId]`, `ITEM_ICON[itemId]`, `MOON[lunarPhase]`, `BACKGROUND[sceneId]`). Missing files fail the build; nothing in `src/core` knows about paths.

---

## 4. Engine contract

### 4.1 Existing public API (used as-is)

From `src/core/index.ts`:

- `loadConfig({ rules, items })` — Vite imports `content/rules.default.json` and `content/items.json` directly.
- `createCampaign({ seed, birthSign, playerName, scionName }, config)`.
- `getAvailableActions(state, config)` — the **only** source of which buttons are enabled.
- `applyAction(state, action, config) → { state, events }` — pure; throws `RuleError` and leaves state untouched.
- `getCalendar(state, config)`, `getDerivedStats(state, config)` — date, age, lunar phase, solar aspect, next critical period, ceilings, Purse Protection.
- `hashConfig(config)` — stored with saves.

Facts the UI relies on:

- `getAvailableActions` filters unaffordable tutors/rests and returns only `REST rest_home` while a convalescence is pending. Show the filtered-out activities as **disabled with a reason** ("Costs 20, treasury 12"), not hidden; the reason comes from the preview's `cost`/`affordable`.
- Jobs are always available; failure is possible.
- During pilgrimage, `encounter_reveal` is transient — the UI never sees it.
- After `CHOOSE_APPROACH` the returned state has **already moved on** (to `continue_or_retreat`, `waystation_decision`, `reroll_or_accept`, back to `home` after a wipeout, or `victory`). The UI must show the roll result from the events *before* presenting the next stage (§5.2).
- The next threat is only drawn on `CONTINUE_ENCOUNTER`, so continue/retreat is decided blind. Don't show a "next threat".
- Seeds: the UI generates them (`crypto.getRandomValues`), never `src/core`.
- Default config has `items.acquisition: "disabled"` and an empty starting inventory, so item UI is normally empty. Hide item slots when `equipmentIds`/`consumableIds` are empty; the dev panel can load a variant to exercise them.

### 4.2 New: `src/core/preview.ts` (additive, pure)

The handoff requires showing costs, gains and odds before commit, computed by the backend. Nothing public does this today; the needed pieces exist as internal functions. Add one module, export it from `src/core/index.ts`, and cover it with tests. It must pass `core-purity.test.ts`.

```ts
export interface BurdenOutcome {
  stats: Record<Estate, number>;        // signed, clamped deltas
  fatigue: number;
  melancholy: number;
  coin: { min: number; max: number };   // treasury delta; min===max unless a coin die applies
  collapse: 'fatigue' | 'melancholy' | 'both' | null; // would this outcome collapse her?
}

export interface HomePreview {
  activityId: ActivityId;
  kind: 'tutor' | 'job' | 'rest';
  cost: number;                 // modified fee (0 for jobs)
  affordable: boolean;
  modifiers: string[];          // ModifierSet.sources, e.g. ['solar:trine', 'lunar:waxing']
  chance: number | null;        // job success %, null = automatic (Stables) or not a job
  success: BurdenOutcome;       // the guaranteed outcome for tutor/rest
  failure?: BurdenOutcome;      // jobs with a check only
}

export function previewHomeActivity(
  state: CampaignState,
  action: Extract<GameAction, { type: 'TRAIN' | 'WORK' | 'REST' }>,
  config: RulesConfig,
): HomePreview;

export interface ApproachPreview {
  estate: Estate;
  odds: EncounterOdds;          // matchup, multiplierPct, roadBonus, flatBonus, probability
  reward: { min: 1; max: number };       // carried Coin on success (1..rewardCoinDie)
  failure: FailurePenalty;      // resource + amount + sources
  failureWipesOut: boolean;     // same test as applyFailure: coin > carried, or burden reaches ceiling
}

/** Only valid at stage choose_approach (and reroll_or_accept for the current approach). */
export function previewApproaches(state: CampaignState, config: RulesConfig): ApproachPreview[];
```

Implementation notes:

- Tutor/rest: call the existing pure `resolveTutor` / `resolveRest` (they draw no RNG) and run `collapseCause` on the applied deltas.
- Jobs: the success/failure branches are deterministic apart from the d100 and Alehouse's coin die. **Preferred:** extract the branch arithmetic in `resolveJob` into an internal `jobOutcome(state, job, success, coinDieValue, modifiers, config)` used by both `resolveJob` and the preview (behaviour-preserving; existing seeded tests guard it). Call it with die = 1 and die = `coinDie` for the min/max. If the extraction is judged too invasive, duplicate it in `preview.ts` with a parity test that compares against `resolveJob` over many seeds.
- `homeModifiers` is private in `reducer.ts`. Export it (no behaviour change) rather than copying it.
- Approaches: `encounterOdds` + `failurePenalty` with `segmentLunarPhase`, `purseProtectionPct`, the slot equipment and current stats — exactly the inputs `rollEncounter` / `applyFailure` use.
- Collapse/wipeout flags compare against ceilings computed from the *post-delta* stats, as the reducer does.

**Retreat preview needs no core code:** `RETREAT` draws no RNG, so the UI dry-runs `applyAction(state, {type:'RETREAT'}, config)` and summarises the events (loot forfeited, toll, banked). Same for `RETURN_HOME`. Never dry-run actions that draw (`WORK`, `CHOOSE_APPROACH`, `CONTINUE_*`, `BEGIN_PILGRIMAGE`) — that would leak the roll.

Tests (`src/tests/preview.test.ts`): for each tutor/rest, the preview equals the deltas actually applied by `applyAction`; job previews bracket the actual result across seeds and `chance` equals `job_resolved.probability`; approach `probability` equals `encounter_resolved.probability`; `failureWipesOut` matches whether a forced failure produces a `wipeout` event; astrology sources appear in the right weeks (trine, square, waning, full moon).

---

## 5. Frontend architecture

### 5.1 Layout on disk

```text
index.html                     Vite entry (repo root)
vite.config.ts                 react plugin; base './'
tsconfig.json                  unchanged for core/sim
tsconfig.ui.json               extends root; adds "jsx": "react-jsx", "lib": ["ES2022","DOM"], includes src/ui
src/ui/
  main.tsx                     mount, font loading, stage scaler
  assets.ts                    asset registry (§3.3)
  text/
    labels.ts                  display names: estates, tutors, jobs, rests, items, signs, months, modifier sources, event sources
    intro.ts                   intro script: [{ panel: '01A', text: '…' }, …]
  engine/
    store.ts                   GameStore (§5.3)
    screen.ts                  deriveScreen(state, ui) (§5.2)
    summarize.ts               events → ResultSummary (pure)
    persistence.ts             localStorage saves (§7)
  components/                  Panel, Button, Bar, ConditionGauge, StatBlock, EstateIcon, CoinAmount,
                               DateBlock, RouteStrip, ActivityCard, PreviewPanel, ResultPanel, Modal, Stage
  screens/                     Title, Intro, Setup, Home, Activity (shared for tutor/job/rest),
                               PilgrimagePrep, Encounter, Waystation, Outcome, SaveLoad, DevPanel
  styles/
    tokens.css                 colours, spacing, font stacks
    base.css                   @font-face, resets, focus ring
```

Keep `src/ui` importing only from `src/core/index.ts` (and the content JSON). `src/simulation` is untouched.

### 5.2 Screen routing

The game screen is a pure function of `CampaignState` plus a little UI-only state that is **not** saved:

```ts
type UiState = {
  menu: 'title' | 'intro' | 'setup' | 'game';
  homeView: 'hub' | 'tutor' | 'job' | 'rest' | 'prep';  // sub-menus; navigation never costs time
  pendingResult?: ResultSummary;                         // shown until dismissed
  overlay?: 'saveload' | 'confirm' | 'dev';
};
```

`deriveScreen(state, ui)`:

| Condition (first match wins) | Screen |
|---|---|
| `ui.menu !== 'game'` | Title / Intro / Setup |
| `ui.pendingResult` | Result panel over the current scene (dismiss → re-derive) |
| `phase === 'victory'` / `'defeat'` | Outcome |
| `phase === 'pilgrimage'`, stage `choose_approach` / `reroll_or_accept` / `continue_or_retreat` | Encounter |
| `phase === 'pilgrimage'`, stage `waystation_decision` | Waystation |
| `phase === 'home'`, `pendingConvalescence` | Home hub with a forced-rest banner (only "Rest at home" enabled) |
| `phase === 'home'` | `ui.homeView` |

Because the screen derives from engine state, a loaded save lands on the right screen with no extra bookkeeping. `pendingResult` is the one thing that bridges "the engine already moved on" and "the player hasn't seen the roll yet".

### 5.3 Store

```ts
class GameStore {
  config: RulesConfig;
  state: CampaignState | null;
  ui: UiState;
  lastEvents: GameEvent[];
  error: string | null;
  busy: boolean;                            // blocks double submission
  dispatch(action: GameAction): void;       // applyAction → set state, pendingResult = summarize(events), autosave
  setUi(patch: Partial<UiState>): void;
  newGame(opts: CreateCampaignOptions): void;
  load(slot: SlotId): void;
  subscribe / getSnapshot                   // for useSyncExternalStore
}
```

- `dispatch` checks the action against `getAvailableActions` before calling `applyAction`; a `RuleError` is shown as a toast and state is unchanged.
- Not every action needs a result panel: `CONTINUE_ENCOUNTER` (just reveals the next threat) and `USE_CONSUMABLE` for Theriac/Wort can update in place. `summarize` returns `null` for those.

### 5.4 Result summaries

`summarize(events, before: CampaignState): ResultSummary | null` groups events into:

- **headline:** e.g. "Village Watch — success (rolled 42 vs 61%)", "Encounter won", "Collapse!", "Wipeout", "Waystation 3 reached", "Victory".
- **rows:** per-quantity net changes with sources: `Bellatores +2 (job)`, `Fatigue +5 (job, opposition ×1.5)`, `Treasury −20 (physician fee)`, `Carried +3 (reward)`.
- **weeks:** count of `week_spent` events with reasons (so a collapse shows "2 weeks passed: work, convalescence").
- **tone:** `good | bad | neutral` for the panel accent.

Pure and unit-tested against hand-built event lists and a few real `applyAction` results.

---

## 6. Screens

All coordinates are logical px on the 1280×720 stage.

### 6.1 Common chrome

- **Top bar (h 56):** DateBlock (zodiac glyph of the *current month's sign*, "Week 2 of March, 1450", age), moon icon + phase name, solar aspect badge (only when not `none`), "N weeks remain", treasury with coin glyph, Save button. Present on Home, activity screens and Prep.
- **Pilgrimage HUD** replaces the top bar on Encounter/Waystation: segment name ("Road to Waystation 3" / "Final Gauntlet"), encounter `i / N` pips, lunar phase (locked at segment entry — label it "Moon at departure"), carried Coin, treasury (dimmed), the three Estate values, both condition gauges.
- **Toasts** for rule errors; **Confirm modal** only where the button text doesn't already state cost and time (departure, retreat, return home).

### 6.2 Title

Background `title_1920x1080`. Column of buttons at right-centre: *New Game*, *Continue* (only if autosave exists and its `configHash` matches; otherwise show "Continue (incompatible save)" disabled with tooltip), *Load*, *Credits*. Version string bottom-left.

### 6.3 Intro

Framed 1024×768 panel scaled to ~720×540 centred-left, parchment text box right (or below on the panel) with the line for that panel. Click / Space / Enter = next, Esc / *Skip* = jump to setup. Script lives in `src/ui/text/intro.ts` (text from the handoff, 04B omitted).

### 6.4 Setup

Left: princess full portrait. Right parchment panel: *Her name* (text input, default "Elaine" or similar placeholder), *Your name* first/last (defaults provided), 4×3 zodiac grid as radio buttons (label + glyph). Below the grid: starting stats preview, computed by calling `createCampaign` with a throwaway seed and reading `stats`/`treasury` — no frontend formula. *Begin* creates the campaign.

### 6.5 Home (hub)

```text
┌──────────────────────────── top bar ─────────────────────────────┐
│          │                                      │                │
│ princess │        (background visible)          │  side panel    │
│ 360×640  │                                      │  name, sign    │
│          │   ┌──────── action menu ─────────┐   │  ── Estates ── │
│          │   │ Tutoring   Work   Rest        │   │  ⚔ B  23  ▬▬  │
│          │   │ Pilgrimage                     │   │  📖 O 15  ▬▬  │
│          │   │ (Social — later, greyed note)  │   │  ⚒ L 15  ▬▬  │
│          │   └────────────────────────────────┘   │  ── Condition ─│
│          │                                      │  Fatigue  ▬▬|░ │
│          │                                      │  Melanch. ▬▬|░ │
│          │                                      │  Purse prot. % │
│          │   route strip: ●─●─○─○─○─✠           │  Inventory     │
└──────────┴──────────────────────────────────────┴────────────────┘
```

- Side panel (w ~340) is parchment-filled. Estate rows: icon + name + value + a slim bar (0–100) in the Estate colour (red / blue / green Kenney bars). Colour is never the only cue: icon and name always shown.
- **ConditionGauge:** 0–100 track. Fill = current (yellow bar for Fatigue; Melancholy uses the yellow bar with a CSS `filter: hue-rotate()` to violet, or a plain CSS fill — avoid red/blue/green, which mean Estates). The region above the ceiling is hatched grey with a ceiling tick and label `34 / 81`. Warning state at ≥ 80% of the ceiling (pulsing outline, text "Near collapse").
- Next critical solar period, if any: one line under the date ("Square in 3 weeks: tutors ×1.3 gain, ×2 strain").
- Forced convalescence: banner across the menu, only *Rest at home* enabled.

### 6.6 Activity screens (Tutor / Work / Rest — one component)

Props: `kind`, `background`, `accent`, list of options. Layout: option cards in a row/2×2 grid on the left two-thirds, PreviewPanel on the right third.

- **ActivityCard:** portrait/icon (tutors: portraits; jobs: Stables → hammer icon / merchant / estate icon; rests: icon or no art), name, Estate icon, cost, one-line effect summary (from preview). Disabled cards show the reason.
- **PreviewPanel** (from `previewHomeActivity`): cost; chance (jobs) as a big "61%" with "Automatic" for Stables; "On success" and "On failure" columns of deltas; projected Fatigue/Melancholy drawn on mini ConditionGauges with the projected fill ghosted; **collapse warning** if `collapse !== null`; modifier chips with plain-English labels (`solar:trine` → "Trine: +15% job success"). Buttons: *Commit week* (primary), *Back*.
- Styling difference per kind, cheap: background image, accent colour of panel header, card arrangement (tutors: 3 tall portrait cards; jobs: 2×2; rest: 4 short cards on a darker scrim over the home background).

### 6.7 Pilgrimage preparation

Background pilgrimage. Left: RouteStrip large, highlighting the next segment (`furthestWaystation` → next; final if `isFinal`), its road bonus, and "Moon this week: Full — burden penalties ×2, advantage ×2". Right panel:

- Departure fee (from descriptor), treasury, **carry slider** `[minCarry, maxCarry]` with numeric input and quick buttons (0 / 25% / 50% / all). Show "Treasury after departure: X".
- Equipment and consumable selectors (one each) only if the descriptor lists any; item icon + effect text.
- Current conditions vs ceilings; Purse Protection %.
- Summary line: "Costs 1 week + 10 Coin fee. Lose the run's loot and carried Coin above Purse Protection on wipeout." *Depart* / *Back*.

### 6.8 Encounter

```text
┌────────────────────────── pilgrimage HUD ─────────────────────────┐
│                                                                   │
│   ┌───────── threat card ─────────┐   ┌──── approaches ────────┐  │
│   │  [Estate-colour frame]         │   │ ⚔ Bellatores  73%      │  │
│   │  big Estate icon               │   │   fail: +15 Fatigue    │  │
│   │  "A Bellatores threat"         │   │ 📖 Oratores    38%      │  │
│   │  flavour line (per estate)     │   │   fail: +30 Melancholy │  │
│   └────────────────────────────────┘   │   ⚠ would collapse     │  │
│                                        │ ⚒ Laboratores 95%      │  │
│                                        │   fail: −7 carried     │  │
│                                        │ [Skip: 10 Coin] (new🌑) │  │
│                                        └────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

- Threat card: CSS frame tinted by Estate colour, icon at 96 px, three rotating flavour lines per Estate in `labels.ts` (e.g. Bellatores: "Brigands block the road"). No illustrations needed.
- Approach buttons come straight from `previewApproaches`: probability, matchup word (Advantage / Even / Disadvantage), failure cost, wipe-out warning. Keyboard 1/2/3.
- **Roll result** (pendingResult): "Rolled 42 vs 73% — Success, +3 Coin" or the penalty; then the stage's actions.
- `reroll_or_accept`: the failed roll stays on screen; buttons *Accept failure (+15 Fatigue)* and *Drink Metheglin (reroll)*.
- `continue_or_retreat`: *Press on* and *Retreat home* (confirm modal shows the dry-run retreat summary); consumable button if usable.
- Wipeout / victory arrive as `pendingResult` and then route to Home / Outcome.

### 6.9 Waystation

Waystation background, centre panel: "Waystation N secured", route strip, carried Coin and earned loot this run, conditions. Buttons: *Continue to next waystation (1 week, no fee)* — hidden when no weeks remain, *Return home (bank X Coin)*, consumable if usable. After the last regular waystation, *Continue* is labelled "Begin the Final Gauntlet".

### 6.10 Outcome

Title background, central parchment: victory or "The Conjunction has come" (deadline). Key run stats (week reached, final Estates, waystations). *Return to title*. The autosave is kept so the final state can be inspected; *New Game* overwrites it.

### 6.11 Save / Load overlay

Autosave + 3 slots. Each slot shows scion name, sign glyph, date, phase ("Home", "On the road: segment 3, 2/5"), real-time saved. Save / Load / Delete per slot. Loading a save with a different `configHash` asks for confirmation ("rules changed since this save; continue anyway?").

### 6.12 Dev panel (`?dev`)

Fixed seed input for New Game, config select (default / experimental / legacy; plus optional variant JSON paste for items testing), buttons: dump state JSON, copy last events, give +100 Coin (applied by editing a cloned state — dev only, clearly labelled). Not shipped in a pitch build.

---

## 7. Persistence

```ts
interface SaveFile {
  format: 1;
  savedAt: string;          // ISO timestamp (UI layer may use Date)
  configId: string;         // rules.id, e.g. "default"
  configHash: string;       // hashConfig(config)
  state: CampaignState;     // version 1
}
```

- Keys: `hidden-scion:auto`, `hidden-scion:slot1..3`.
- Validate on load: JSON parses, `format === 1`, `state.version === 1`, and `getAvailableActions` doesn't throw. Invalid → slot shown as "Corrupt save" with Delete only.
- No migration code yet; future `CampaignState.version` bumps add it.

---

## 8. Styling tokens

```css
:root {
  --ink: #2b1d0e;           --ink-muted: #5a4630;
  --parchment: #efe2c4;     --parchment-dark: #d9c59a;
  --surround: #15110c;
  --bellatores: #a3271f;    --oratores: #24508f;    --laboratores: #2f6b2c;
  --fatigue: #c99a1a;       --melancholy: #6b4a8c;
  --good: #2f6b2c;          --bad: #a3271f;
  --focus: #f2c14e;
  --font-body: 'IM Fell English', Georgia, serif;
  --font-head: 'Canterbury', 'IM Fell English', serif;
  --font-title: 'Carrick Caps', 'Canterbury', serif;
  --text-sm: 15px; --text-md: 18px; --text-lg: 22px; --text-xl: 32px;
}
```

- Minimum body size 15 logical px (≥ ~15 real px at 1280×720). Canterbury only ≥ 22 px; it is not legible small.
- Text over backgrounds always sits on a parchment panel or a ≥ 70% dark scrim.
- Focus ring: 3 px `--focus` outline + 2 px offset on every interactive element; buttons are real `<button>`s.
- Fonts declared with `font-display: block` and the app waits on `document.fonts.ready` before first render to avoid a fallback flash.

---

## 9. Tooling changes

- `package.json` dependencies: `react`, `react-dom`; devDependencies: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.
- Scripts: `"dev": "vite"`, `"build": "tsc -p tsconfig.ui.json --noEmit && vite build"`, `"preview": "vite preview"`. Keep `typecheck` for core; add `"typecheck:ui": "tsc -p tsconfig.ui.json --noEmit"`.
- `vitest.config.ts`: unchanged. UI logic that needs tests (`screen.ts`, `summarize.ts`, `persistence.ts`, `labels.ts` coverage) is plain `.ts` and tested under `src/tests/ui-*.test.ts`. No DOM/component test harness in this build.
- `core-purity.test.ts` already forbids React in `src/core`; keep it that way.
- `.gitignore`: add `dist/`.

---

## 10. Implementation tasks

Each task ends with tests passing, `npm run typecheck` + `typecheck:ui` clean, and a Conventional Commit.

| # | Task | Notes |
|---|---|---|
| U1 | **Core preview API** — `src/core/preview.ts`, export `homeModifiers`, optional `jobOutcome` extraction, `src/tests/preview.test.ts`. | Only core change. Independent of the rest. |
| U2 | **Scaffold** — Vite + React, `tsconfig.ui.json`, `index.html`, Stage scaler, fonts, tokens, asset registry, labels. A blank stage showing the home background. | |
| U3 | **Store + routing + persistence** — `store.ts`, `screen.ts`, `summarize.ts`, `persistence.ts` with unit tests. | Can start against U1's types. |
| U4 | **Components** — Panel (9-slice), Button, Bar, ConditionGauge, StatBlock, DateBlock, RouteStrip, Modal, Toast, ResultPanel. A `?gallery` route to eyeball them. | |
| U5 | **Home + activity screens** — hub, Tutor/Work/Rest via the shared Activity screen, previews, results, forced convalescence. | First playable: a home-only campaign to deadline. |
| U6 | **Pilgrimage** — Prep, Encounter (incl. reroll/consumables/skip), Waystation, retreat/wipeout results, final gauntlet, Outcome. | Full campaign playable. |
| U7 | **Front door** — Title, Intro, Setup, Save/Load overlay, Continue. Dev panel. | |
| U8 | **Playtest pass** — play one campaign to victory and one to deadline at 1280×720 and 1920×1080; fix readability/focus issues; README "Running the UI" section. | |

U1 and U2 can run in parallel; U3/U4 after U2; U5 after U3+U4; U6 after U5; U7 any time after U3.

### Branches and PRs

The work ships as three PRs, each on its own branch and worktree, committing task by task:

| PR | Branch | Tasks | Ends with |
|---|---|---|---|
| 1 | `feature/core-preview` | U1 (+ this breakdown) | `previewHomeActivity` / `previewApproaches` exported from `src/core` with tests. The only PR that touches the rules engine. |
| 2 | `feature/ui-home` | U2–U5 | Vite/React app running; Home, Tutor, Work and Rest playable through to the deadline. |
| 3 | `feature/ui-pilgrimage` | U6–U8 | Pilgrimage, final gauntlet, title/intro/setup, save/load, dev panel; full campaign playable. |

PR 2 starts from `main` after PR 1 merges (it consumes the preview API).

**Acceptance:** from `npm run dev`, a player can start a game, choose name/sign, play all 96 weeks using every tutor/job/rest, depart and resolve pilgrimage segments, see retreat, wipeout and collapse results, reach waystations, attempt the final gauntlet, win or hit the deadline, and save/load at any point — with every number on screen coming from `src/core`.

---

## 11. Missing assets and open questions

Nothing blocks the playtest build; every gap below has a placeholder plan. Items marked **(want)** are the ones worth mocking up.

| Gap | Placeholder in this plan | Ask |
|---|---|---|
| **IM Fell DW Pica** font (named in `assets/info.md` and `fonts/info.txt`) is not in `assets/fonts/`; only IM Fell English is. | Use IM Fell English. | Add `IMFePIrm28P.woff2` (DW Pica roman) if you prefer it. |
| Rest background | Home background + dark scrim. | Optional. |
| **Waystation / abbey** background **(want)** | `background_waystation` (copy of pilgrimage). | Overwrite with a 1920×1080 abbey/hospice image. |
| **Capital / final gauntlet** background **(want)** | `background_capital` (copy of title). | Overwrite with a 1920×1080 castle/siege image. |
| Encounter illustrations | Estate-coloured card with icon + flavour text. | Later; 3 (one per Estate) would already help. |
| Job / rest card art | Icons and reused portraits (§3.1). | Optional. |
| Princess headshot | `portrait_princess_right` (copy of damsel). | Overwrite when ready. |
| Estate icons are 32×32 pixel art; they'll look crude at 96 px on the threat card. | `image-rendering: pixelated`. | **(want)** larger or vector sword/book/hammer emblems (~128 px, transparent). |
| Rights tracking | — | The handoff asks for per-image provenance; backgrounds, portraits, title and intro panels have no source notes yet. Not needed for playtesting; needed before any public pitch. |

Rules-level questions surfaced while planning (not UI decisions; recorded for the rules owner):

- The lunar phase used for a whole segment is locked at the entry week. The HUD labels it "Moon at departure" so players aren't confused when the calendar moon differs.
- With items disabled in the default config, Prep and Encounter item UI will never appear in normal play; that's expected for this build.
