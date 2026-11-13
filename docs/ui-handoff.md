# The Hidden Scion — UI Planning Handoff

**Status:** UI implementation planning brief  
**Audience:** Coding agent / frontend developer  
**Scope:** First playable browser PoC, with hooks for later narrative expansion  
**Related work:** The TypeScript game rules/backend and seeded simulation are being developed separately. **Treat the current game rules, state definitions, and balance decisions in the repository as authoritative**; this document concerns presentation and interaction, not revisions to the mechanics.

## 1. Goal and design priorities

Create an attractive, functional, browser-based UI for a medieval/Arthurian raising simulator. The player guides a hidden royal heir through a 96-week schedule of training, working, resting, and attempting a dangerous pilgrimage toward the capital. The presentation should evoke late-medieval woodcuts and illuminated manuscripts, using sourced public-domain artwork and an existing UI texture pack. The initial build is a gameplay PoC and potential pitch; visual coherence and legibility matter more than elaborate animation.

Priorities, in order:

1. Make every implemented gameplay action accessible and understandable, including its costs, risks, and results.
2. Make the **Home** and **Pilgrimage** screens polished and visually distinct: these carry the game's identity and most of its play time.
3. Reuse existing artwork and the acquired UI tiles rather than producing substantial new art.
4. Offer visually different settings for training, work, rest, and travel without duplicating underlying UI logic.
5. Retain a clean seam between the existing TypeScript rules/state engine and React presentation.
6. Keep implementation small; no substantial editor, animation engine, or broad responsive redesign is required for the PoC.

**Out of scope for this UI phase:** fully implemented social/companion relationships and branching narrative; companion parties; shopping; expanded final boss mechanics; multiple endings; complex sprite animation and navigable 2D maps. Display social as disabled/coming later only if useful for the pitch; do not make it seem playable.

## 2. Platform and visual conventions

- **Stack:** React + TypeScript + Vite, integrated with the already-developed TypeScript game rules. No Phaser or separate canvas game engine is needed for these menu-driven interactions.
- **Aspect ratio:** primarily desktop/laptop, **16:9** game composition. Use a **1920×1080 reference artboard** for visual asset composition, and optionally a 1280×720 logical layout for UI measurements. These are *design conventions*, not a requirement to render into a fixed-resolution `<canvas>`.
- **Scaling:** fit the game to available browser space without distortion; letterbox/pillarbox if preserving fixed composition. Preserve readability at **1280×720**, including laptop browser chrome and browser zoom. Decide CSS implementation after viewing actual assets; avoid blurry upscaled text.
- **Appearance:** manuscript parchment, woodcut imagery, restrained colored highlights: Bellatores red, Oratores blue, Laboratores green. Prioritize readable body text over decorative Gothic type. Maintain consistent framing, spacing, hover/focus states, and icon meanings.
- **Image delivery:** prefer optimized WebP for photographic/scanned backgrounds and portraits, lossless WebP/PNG where thin black hatching or transparency requires it, SVG for simple scalable ornamentation where available. Preserve unmodified source files separately.
- **Audio:** optional ambient BGM and UI/result SFX through a simple audio manager (e.g., Howler.js); MP3 is a safe baseline. Include mute and music/SFX volume settings; honor browser click-to-start audio policies.
- **Licensing/provenance:** source visuals are intended to be public-domain/CC0. Track source URL, attribution/rights evidence, and edits; do not assume every image scraped from a scanned book is licensed identically.

## 3. High-level navigation

```text
Title / Main Menu
  ├─ New Game → Introduction → Character Setup → Home
  ├─ Continue / Load → Resume saved state
  └─ Settings / Credits

Home (weekly hub)
  ├─ Tutoring → activity selection → result → Home
  ├─ Work → job selection → roll/result → Home
  ├─ Rest → rest selection → result → Home
  ├─ Pilgrimage Preparation → Encounter loop
  │    ├─ Choose approach → roll/result → continue or retreat
  │    ├─ Waystation → continue to next segment or return Home
  │    ├─ Wipeout → penalties + convalescence → Home
  │    └─ Final Gauntlet → victory/ending or failure/return
  ├─ Character / Inventory (overlay)
  ├─ Calendar / Astrology (panel or overlay)
  └─ Pause / Save / Load / Settings (overlay)

Social/Companions: later phase, not currently interactive.
```

Screen navigation must not itself advance time; only successful submission of a scheduled activity, pilgrimage segment, or other explicitly time-costing game action should do so, according to the backend rules. Display confirmation before irreversible spending/time commitments.

## 4. Core screen inventory

### 4.1 Title screen

**Purpose:** Set tone, begin or resume play.  
**Displays:** Title/logo, atmospheric historical artwork, small version/credits note.  
**Actions:** New Game; Continue/Load if a compatible save exists; Settings; Credits.  
**Assets:** 1 strong background illustration (castle/town/manor), title lettering/emblem, optional title BGM.  
**Notes:** This is a high-value custom composition rather than a generic panel layout.

### 4.2 Introduction + simple character setup

**Purpose:** Convey the murdered royal dynasty, hidden heir, Great Conjunction, and preparation deadline; initialize the daughter.  
**Displays:** Intro text and sequence of woodcut panels; name and zodiac/birth sign selection; starting-stat preview.  
**Actions:** Advance/skip intro; enter/select name; choose sign; confirm new game.  
**Assets:** Available intro illustrations (roughly 3–4 panels if supplied), one portrait of the daughter, zodiac symbols or simple typographic alternatives, common dialogue frame.  
**Notes:** A single framed illustration region with changing artwork/text is sufficient. Do not block gameplay on elaborate transitions. Starting age/year/month/96-week duration must follow the finalized backend data; design currently assumes age 14, starting in her birth month around 1450.

#### placeholder intro text

numbers refer to the intro image number.

01A: One score and four years ago, the good king Cornelius brought peace to these lands.

01B: His was a fair and just rule, and he loved all his subjects, as they loved him.

02: But the King loved no one above his bride, the kind-hearted Queen Isolde.

03: On the day of the Conjunction, their child was born, a daughter. The kingdom was overcome with joy.

04A: But the jealous courtier Vortigan, spurned by Queen Isolde, plotted to overthrow king Cornelius. 

04B: (skip for now)

04C: He led a treasonous band of knights against the king. Vortigan himself smote the king on the field of battle.

05: But you know this, of course, as it was you, brave knight, who fled the castle with the king's child.

06: Though your holdings are modest, you have raised her well these last fourteen years, as if she were your own. 

07: But now, My Lord, the next Conjunction approaches, and I feel a great foreboding in my breast.

08: In dreams I see a great fire welling in your daughter, but to what end, I cannot know... 

### 4.3 Home / weekly scheduling hub — **highest priority**

**Purpose:** Main point of orientation and activity selection.  
**Displays:** Daughter portrait; date (year/month/week), age, lunar phase, solar aspect; three Estate stats; current Fatigue and Melancholy *and their respective dynamic maximum ceilings*; treasury Coin; pilgrimage progress/next milestone; any important status/warnings.  
**Actions:** Open Tutoring, Work, Rest, Pilgrimage; open Character/Inventory, Calendar/Astrology, Save/Load, Settings. Social can be visibly deferred.  
**Assets:** Manor/study background, primary daughter image, Estate emblems, lunar phase and calendar ornaments, Coin symbol, shared panels/buttons/bars.  
**Notes:** Treat the Home screen as the primary pitch image. Reserve space for prominent character art and a clearly readable schedule. The two condition gauges start at zero and increase with strain; higher is worse and reaching the **current derived cap** triggers collapse. If the design uses a full 100-point bar, grey out the inaccessible section above the cap and clearly distinguish current fill from ceiling.

### 4.4 Tutoring

**Purpose:** Choose a paid, guaranteed stat-growth activity.  
**Displays:** Three tutors (Hedge Knight / Hermit / Smuggler), associated Estate, cost, expected stat changes, opposing-stat effect, condition costs, relevant astrology modifiers, treasury.  
**Actions:** Choose tutor; inspect projected effects; confirm weekly activity; view outcome; return Home.  
**Assets:** One shared training/courtyard or manuscript background; three tutor portraits or illustrated cards; shared activity-selection and result components.  
**Notes:** Use changing tutor art over one location backdrop rather than three full bespoke screens. All actual values must come from the backend, not frontend-calculated approximations.

### 4.5 Work / Jobs

**Purpose:** Earn Coin and potentially improve stats via risk-bearing work.  
**Displays:** Stables, Alehouse, Village Watch, Scriptorium; success probability or guarantee, potential payout, stat increase, expected condition costs, applicable astrology bonuses, treasury.  
**Actions:** Choose job; confirm; resolve backend d100 result; show success/failure, Coin/stat/condition changes; return Home.  
**Assets:** One village/workshop background; four job illustrations/cards; optional simple die/result emblem.  
**Notes:** Present risk before commitment and the *actual* rolled outcome afterward. Avoid building a frontend copy of the probability formula.

### 4.6 Rest / Recovery

**Purpose:** Manage accumulated strain.  
**Displays:** Home rest, Bathhouse, Shrine, Banquet; respective costs; expected Fatigue/Melancholy reductions including current lunar effects; existing meter levels.  
**Actions:** Choose and confirm recovery action; show updated conditions and treasury; return Home.  
**Assets:** Calm domestic/interior background; up to four small illustrations; standard activity card/result UI.  
**Notes:** Reuse UI structure from Tutoring and Work, but change composition/color/artwork enough to avoid visual monotony.

### 4.7 Pilgrimage preparation

**Purpose:** Make risk/gear/carrying decisions before a new expedition.  
**Displays:** Furthest unlocked waystation, upcoming segment, departure preparation cost, treasury, current conditions/ceilings, segment road bonus and lunar effects, available inventory, carried Coin allocation and item slots.  
**Actions:** Set carried Coin; choose permitted equipment and consumable per backend limits; review summary; confirm departure or cancel.  
**Assets:** Pilgrim's Road / countryside illustration; route/map visual and waystation markers; item icons; pouch/coin visual.  
**Notes:** Distinguish **treasury** from **Coin carried on pilgrimage**. Starting from home pays the departure cost; continuing directly from a waystation does not repay it.

### 4.8 Pilgrimage encounter — **highest priority**

**Purpose:** Play the core push-your-luck encounter sequence.  
**Displays:** Current threat card with Estate cue/color; illustrated encounter and flavor text; current segment and encounter count; three player Estate values; Fatigue/Melancholy current vs cap; carried Coin; applicable road/astrology/equipment modifiers; probabilities for available approaches; held consumable.  
**Actions:** Select Bellatores/Oratores/Laboratores approach; confirm roll; use legal consumables (including reroll at its permitted moment); see actual result and reward or penalty; choose continue/retreat when eligible.  
**Assets:** Road/wilderness backdrop; a repeatable encounter card frame with three Estate-color variants; starter encounter illustrations (reuse art where needed); three Estate icons/buttons; progress markers; small success/failure/loot visual treatments; item icons.  
**Notes:** Failed rolls normally advance encounter progress while imposing resource penalties; the player must survive to the next waystation. Zero carried Coin is allowed, but a loss exceeding it causes a wipeout (subject to backend protection rules). Do not imply that a failed roll blocks route progress. Keep each encounter legible and quick to resolve; static art with subtle transitions is sufficient.

### 4.9 Waystation + pilgrimage outcomes

**Purpose:** Mark segment completion and provide a consequential continue/return choice.  
**Displays:** Waystation reached/unlocked, route progress, resources, condition levels, acquired loot, next-segment preview and time cost.  
**Actions:** Continue toward next waystation (spending another week, no new departure fee), or return Home. Related result overlays handle voluntary retreat and wipeout.  
**Assets:** One abbey/hospice illustration reusable across stations; route marker/banners; shared outcome panel.  
**Notes:** Retreat consumes the week already spent on the segment but adds no convalescence week. Wipeout loses progress since the last secured waystation, run loot and carried consumables, applies carried-Coin loss according to the Purse Protection rule, deducts a convalescence charge **up to 50 Coin without taking treasury negative**, and imposes an additional recovery week. The backend remains authoritative on all details.

### 4.10 Final gauntlet + outcome

**Purpose:** Demonstrate a win condition after the route to the capital has been completed.  
**Displays:** Capital/siege art, higher-stakes gauntlet status, player resources, end-of-campaign results.  
**Actions:** Resolve encounters using the existing pilgrimage mechanics; retry when allowed before the deadline; see success or deadline-failure result; return to title/load.  
**Assets:** Capital/castle illustration, distinct border/title treatment, one simple victory/failure illustration or overlay.  
**Notes:** For the initial PoC this is a harder pilgrimage sequence, **not** a separate combat engine or narrative ending tree. Three-phase Estate-specific finale and multiple endings are postponed.

## 5. Shared UI components and overlays

Build only a small set of reusable visual components, driven by backend state:

- **GameFrame / SceneBackground** — fixed-composition background with consistent margins and scalable overlays.
- **Panel / DialogBox / Button / MenuCard / Tooltip / Modal** — common UI tiles/textures and selected/disabled/focus states.
- **CharacterSummary** — daughter portrait, name, three Estate values, treasury and current status.
- **ConditionGauge** — current value, derived maximum, inaccessible region above cap, warning/near-collapse state.
- **CalendarAstrology** — current week/month/year, lunar phase, active solar aspect and upcoming notable modifiers.
- **ActivityOption + ActivityConfirmation + ActivityResult** — shared selection/preview/commit/outcome pattern for tutoring, jobs and rest.
- **EncounterCard + ApproachChoice + RollResult + RouteProgress** — pilgrimage widgets.
- **Inventory / Character sheet / Map** — inspectable overlays rather than additional elaborate locations.
- **Pause / Save / Load / Settings / Credits** — reusable overlay treatment, ideally accessible from Home (and any safe point permitted by the backend).

**UI tile pack:** Start with individual sprites from the CC0 RPG UI pack. Use CSS `border-image`/9-slice for resizable frames where their geometry supports it; use conventional images for irregular buttons or ornaments. Inspect tile edges and slice margins before scaling; one-time preprocessing into a clean 9-slice source is acceptable. Do **not** pre-render dozens of fixed-size panels. The same underlying sprites can be adapted to Godot's nine-patch UI if development later migrates.

## 6. Asset inventory and integration workflow

The owner has already gathered candidate **backgrounds, character portraits, intro panels, primary daughter art, and a UI pack**. The actual inventory, filenames, image dimensions and licenses are not specified here. **Audit the existing files before requesting or creating missing artwork.**

Recommended asset registry (mapping content IDs to real paths, with placeholders only where missing):

```text
assets/
  backgrounds/       title, home, village/training, rest, road, waystation, capital
  intro/             opening-story panels
  portraits/         daughter, tutors; social portraits later
  encounters/        encounter illustrations or cropped woodcuts
  items/             small item illustrations
  ui/                panels, borders, buttons, icons, gauges
  audio/             music, effects (optional initially)
```

Do not assume one new image per logical scene: reuse backgrounds with new character/card art. Allow authored asset references to be mapped by stable content IDs, rather than embedding file paths directly in game-rules objects.

**Proposed minimum viable asset checklist:** title/background composition; daughter portrait; manor/home art; one background or card illustration per activity category; three tutor illustrations; four job illustrations; one road and one waystation art piece; a starter set of encounter illustrations (possibly reused); capital art; Estate/condition/coin symbols; a common panel and button set. If some are missing, use tasteful temporary frames/labels rather than generating new artwork automatically.

## 7. Interaction and UX rules

1. **Preview before commit.** Always show cost, expected gain/loss, current modifiers and time consumed before scheduling an activity or departing on pilgrimage.
2. **Report actual outcomes.** Results should clearly compare before/after values, including changes caused by astrology, failed checks and equipment.
3. **Keep global context visible.** Date, Coin, the three Estates and condition bars must be easy to find, especially during pilgrimage; use a compact HUD or persistent context panel when space is tight.
4. **Show both condition values.** Current Fatigue/Melancholy start at zero; their ceilings start at 75 and increase according to associated stats. Visually indicate the current fill **and** the ceiling. Full meter at its ceiling = collapse.
5. **Make irreversible transitions clear.** Committing an activity or pilgrimage segment consumes time. Offer confirmation when cost/risk isn't already explicit in the button action; prevent accidental double submission.
6. **Respect backend phases.** During pilgrimage, show only legal actions at the current phase (choose approach, resolve, use item, continue/retreat, etc.). Do not duplicate the rules in React.
7. **Save/load actual game state.** Use the backend's serialization/versioning contract. Loading must restore the correct UI screen/phase; handle unavailable/invalid saved games gracefully. Decide exact permitted save points against the implemented rules.
8. **Accessible controls.** Keyboard-operable buttons and menus, discernible focus, contrast on illustrated backgrounds, text that remains readable at 1280×720. Do not make Estate identity rely solely on color.
9. **Fast pacing.** Short fades or result transitions are fine, but every animation should be skippable or quick. Avoid forced long text typing in frequently repeated activity loops.
10. **No fake features.** Disabled social, shop or advanced ending controls should be absent or clearly marked as future content; never present an inert button as operational.

## 8. Suggested visual grouping (avoid monotony cheaply)

| Context | Screens | General art direction |
|---|---|---|
| **Manor** | Home, Character, some Rest | Warm parchment, familiar study/interior, daughter prominent |
| **Village / Court** | Tutors, Work, some Rest | Woodcut location illustration + changing activity cards/portraits |
| **Pilgrim's Road** | Preparation, Encounter, Waystation | Stark landscape, prominent illustrated cards, three Estate-colored accents |
| **Chronicle / Prophecy** | Title, Introduction, Final outcome | Dramatic full-page manuscript/woodcut compositions |

The UI system should look consistent across all contexts; variation comes largely from backgrounds, prominent illustration, and framing—not rebuilding every screen from scratch.

## 9. Proposed implementation sequence (for the coding agent to refine)

This is a dependency-oriented suggestion, **not** a detailed task breakdown:

1. Inventory artwork/UI pack; inspect dimensions, file naming and rights metadata; choose representative visuals.
2. Verify frontend/backend contract: `GameState`, legal actions and game phases, predicted effects/probabilities, results/event logs, saves, and time advancement.
3. Establish 16:9 game shell, typography/color conventions, scene backgrounds, and reusable UI panel/button system; test 9-slicing on actual pack assets.
4. Build **Home** with working date/stats/conditions and activity navigation.
5. Build shared **activity selection → confirmation → results** flow, then style Tutoring, Work and Rest distinctly.
6. Build **Pilgrimage preparation → encounter → outcome → waystation/retreat/wipeout** flow and route progress.
7. Add title, introduction/character setup, final gauntlet result, and save/load/settings overlays.
8. Integrate and verify audio if assets are ready; add restrained transitions, accessibility fixes and performance checks.
9. Exercise one complete 96-week campaign, including successful final challenge, failure/deadline, saving/loading and edge cases.

**Acceptance criterion:** A player can start a new game, select a name/sign, play and understand a 96-week schedule, train/work/rest, embark on and resolve pilgrimage segments, reach waystations, experience retreat/wipeout, attempt the final gauntlet, win or run out of time, and save/load at supported points. The game should look visually cohesive using the supplied non-AI artwork. Social systems are explicitly outside this milestone.

## 10. Open UI-level decisions for implementation planning

- Exact asset inventory and which backgrounds/portraits actually exist.
- Whether layout uses a scaled fixed-size DOM wrapper or fluid CSS within a 16:9 frame (prioritize readable text).
- Exact typography and final color palette based on the existing art.
- Whether the Calendar, Inventory and Pilgrimage Map are full screens or overlays (overlays preferred unless content demands otherwise).
- Which backend phases support manual saves and whether autosave is desirable.
- Whether result information is supplied as event/delta records or derived from a before/after state snapshot.
- Audio assets and the initial set of BGM/SFX, if any.

Resolve these from the repository and supplied assets. Keep gameplay balancing and new narrative design outside this UI handoff.
