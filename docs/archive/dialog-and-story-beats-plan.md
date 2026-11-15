# Technical Plan: Flavor Text, Dialog Scenes and Story Beats

**Status:** completed (T1–T5); archived after the dialog and story-beat review.
**Scope:** the first "personality" pass on the POC. It covers presentation (flavor text, the daughter's thoughts, a visual-novel dialog player) and a minimal story-beat trigger system. Relationship stats and socializing mechanics are out of scope; §9 lists what is postponed.

## 1. Terms

| Term | Meaning |
|---|---|
| **Flavor text** | A 1–2 sentence line on a tutor or job result popup, picked at random. |
| **Thought** | The daughter's inner monologue, shown in a small box under her portrait on the home screen. |
| **Dialog scene** | The UI feature: a full-screen visual-novel presentation with a background, portraits and a text box. |
| **Story beat** | A narrative event. For this POC, one story beat is played as one dialog scene (one ink knot). |
| **Thread** | An ordered chain of story beats, e.g. the Bellatores storyline. Threads never affect each other. |

## 2. Goals and non-goals

**Goals**

1. Random flavor text on tutor results (3+ lines per tutor) and job results (4+ success and 4+ failure lines per job).
2. A random daughter's thought on the home screen.
3. A reusable dialog-scene player driven by ink content.
4. Story beats that fire after a target activity once a minimum date and minimum stats are reached, with one beat per activity and a cooldown per thread.
5. Father–daughter talks through the **Social** button. They are free and spend no week.
6. Some beats grant Coin or an item. Each thread's grand item comes on its penultimate or last beat.
7. All triggers and content live in data files (ink and JSON), so beats can be added or changed without code changes.

**Non-goals (this pass)**

- Relationship levels and a stat for the father–daughter bond.
- Socializing as a week-long activity, and date rolls.
- Choices with lasting effects. Ink choices may only change the following lines of the same scene.
- Ranked or conditional thoughts (the only condition is the "something on my mind" hint, §6.4).
- Story beats on the pilgrimage, at waystations or in the endings.
- Modelling story rewards in the balance simulations (§8).

## 3. Content overview

| Thread | File | Target activities | Main characters | Beats | Grand reward |
|---|---|---|---|---|---|
| Bellatores | `content/story/knight.ink` | `hedge_knight`, `village_watch` | Hedge Knight, Watch Captain, the Squire (rival) | 4–5 | Gambeson |
| Oratores | `content/story/cloister.ink` | `hermit`, `scriptorium` | Hermit, the Brother Librarian, the Heretic Novice (rival) | 4–5 | Saint's Relic |
| Laboratores | `content/story/alley.ink` | `smuggler`, `alehouse` | Smuggler, the Alewife, the Urchin (rival) | 4–5 | Weighted Coin |
| Stables | `content/story/stables.ink` | `stables` | Stablemaster | ~3 | a consumable (e.g. Theriac) |
| Father & daughter | `content/story/father.ink` | `socialize` (the Social button) | the player, the daughter | ~7 | e.g. Metheglin |

About 20–25 beats in total. Placeholder beats are a few dialog turns that get the beat's idea across, to be expanded later.

Names, files and rewards above are suggestions; the content PR (T5) may change them freely because nothing in the code depends on them.

## 4. Flavor text and thoughts (no ink)

### 4.1 Data file

`content/flavor.json`:

```json
{
  "tutor": {
    "hedge_knight": ["...", "...", "..."],
    "hermit": ["..."],
    "smuggler": ["..."]
  },
  "job": {
    "stables":      { "success": ["..."], "failure": [] },
    "alehouse":     { "success": ["..."], "failure": ["..."] },
    "village_watch":{ "success": ["..."], "failure": ["..."] },
    "scriptorium":  { "success": ["..."], "failure": ["..."] }
  },
  "thought": {
    "idle": ["...", "..."],
    "talk_ready": ["I have something on my mind..."]
  }
}
```

- Lists can be any length; code picks from whatever is there. Stables never fails, so its `failure` list may be empty.
- Lines may use `{scion}` and `{player}`, which are replaced by the daughter's name and the player's first name.
- A test enforces the minimum counts (3 per tutor, 4 success and 4 failure per job except Stables failure, 1+ in each thought list) and checks that every key is a real activity.

### 4.2 Picking a line

`src/ui/engine/flavor.ts` (pure TS):

- `pickLine(lines, key)`: chooses an index from a small string hash of `key`. The key is `${state.seed}:${week}:${slot}`, where `slot` is e.g. `job:alehouse:success` or `thought`.
- It must **not** draw from the core's seeded random streams (`state.rng`). Those keep simulations reproducible; flavor text must not shift them.
- Hashing on the week means a re-render or a reload shows the same line. Repeats across weeks are allowed.

### 4.3 Where it shows

- **Result popup:** `ResultSummary` gets an optional `flavor?: string`. `summarize` stays the same; the store fills `flavor` for `TRAIN` and `WORK` results (success or failure from the `job_resolved` event). `ResultPanel` shows it in italics under the title. Rest results were added later (`rest.<rest_id>` lists, 3+ lines each), except the forced recovery rest. Pilgrimage results get no flavor text in this pass.
- **Thought box:** a small parchment box under `home-princess` on `HomeHub`. It shows a `thought.idle` line for the current week, or a `thought.talk_ready` line when a father–daughter beat is ready (§6.4). It is hidden during the forced recovery week.

## 5. Dialog scenes (ink)

### 5.1 How ink is used

- `.ink` files are plain text and can be written and previewed in Inky.
- They are compiled to ink's JSON format, and the `inkjs` runtime plays them. `inkjs` 2.x includes the compiler, so the project does not need the `inklecate` binary.
- Each thread is one `.ink` file, and each beat is one knot (`=== knight_2 ===`). The beat id is `<file>/<knot>`, e.g. `knight/knight_2`.
- Ink is used **statelessly**. Before each scene the runtime resets the story, sets the input variables and jumps to the knot. Ink state is never saved; everything persistent lives in `CampaignState` (§7).

### 5.2 Build step

- A small Vite plugin, `scripts/vite-plugin-ink.ts`, turns `import story from '…/knight.ink'` into the compiled JSON, compiling with `inkjs`'s compiler. Compile errors fail the build or the test run, showing the file and line.
- The plugin goes in **both** `vite.config.ts` and `vitest.config.ts`, so tests compile the real content.
- Files are loaded with `import.meta.glob('../../content/story/*.ink', { eager: true })`, so adding a new thread is just adding a file.
- Each file is compiled on its own. Avoid ink `INCLUDE` in this pass: it needs a compiler file handler, and separate files keep knot names local to each thread.
- `src/ui/ink.d.ts` declares the `*.ink` module type.
- Check the exact `inkjs` import paths (`inkjs/full` or `inkjs/compiler`) when installing and pin the version.

### 5.3 Input variables

Every story file declares the same inputs with preview defaults, so Inky can preview them:

```ink
VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
```

The runtime sets these from `CampaignState` before each scene. Text uses `{scion}`. Ink conditions may use the stats (`{bellatores >= 40: ...}`), but they may only change wording, not the outcome.

### 5.4 Line conventions

| Line | Example | Display |
|---|---|---|
| Speech | `squire: You call that a guard?` | Speaker's name plate plus the text |
| Thought | `scion: (He's not wrong.)` | Name plate plus the text in parentheses, styled as a thought |
| Narration | `The courtyard falls silent.` | Italic text, no name plate, no portrait change |

- A line is speech when it starts with a known character id followed by `:`. Any other line is narration.
- Character ids map to a registry, `src/ui/text/characters.ts`: `{ id: { name, portrait } }`. The names for `scion` and `father` come from the save (the daughter's name and the player's first name). Unknown ids fail a content test.

### 5.5 Tags

**Knot tags** (at the top of a knot; read without playing it, via `story.TagsForContentAtPath(knot)`):

| Tag | Required | Meaning |
|---|---|---|
| `# order: 20` | yes | Position in the thread. Use gaps (10, 20, 30, …) so beats can be inserted later. |
| `# activity: hedge_knight village_watch` | yes | Activities that can trigger the beat (space-separated). `socialize` means the Social button. |
| `# month: 5` | no (default 1) | Earliest campaign month, from 1 to 24 (month 1 is weeks 0–3). |
| `# stat: bellatores 30` | no, repeatable | A minimum stat. Every `stat` tag must be met. |
| `# reward: coin 25` / `# reward: item gambeson` | no, repeatable | Granted when the scene finishes. |
| `# bg: school` | no | The opening background (a `BACKGROUND` key). Defaults to the activity's own background. |
| `# left: scion` | no | The main speaker on the left. Defaults to `scion`, or `father` in the father thread. |

**Global tag** (at the top of a file): `# cooldown: 2` sets the thread's cooldown in weeks (default 2).

**Line tags** (on a line inside a scene):

- `# bg: <id>` cross-fades the background.
- `# right: <id>` places someone on the right before they speak.
- `# left: <id>` changes the main speaker; this should be rare.

### 5.6 Choices

Ink choices (`* [Tease him] …`) show as buttons in the text box, replacing the advance arrow. The ink is written so every branch rejoins with a gather (`-`). Lasting choices are a non-goal, and nothing reads choices afterwards.

### 5.7 The cursor (pure TS)

`src/ui/engine/dialog.ts` wraps an `inkjs` `Story` and has no React, so it can be tested in Node:

```ts
type DialogStep =
  | { kind: 'line'; style: 'speech' | 'thought' | 'narration'; speaker?: string; text: string;
      bg?: string; left?: string; right?: string }
  | { kind: 'choice'; options: { index: number; text: string }[] }
  | { kind: 'end' };

openScene(story: Story, knot: string, inputs: DialogInputs): DialogCursor
cursor.next(): DialogStep
cursor.choose(index: number): DialogStep
```

### 5.8 The dialog screen

`src/ui/screens/Dialog.tsx`, drawn at App level above the current screen (z-order: Dialog > ResultPanel):

- **Fades:** the scene fades in from black, background changes cross-fade, and the scene fades out at the end. All fades are skipped when the player prefers reduced motion (reuse the intro's `prefersReducedMotion`).
- **Text box:** a JRPG-style window at the bottom with the name plate, the text, and a small arrow button at the bottom right (`assets/ui/PNG/arrowBeige_right.png`). Click, Enter or Space advances.
- **Portraits:** these sit above the text box.
  - The left portrait is the main speaker.
  - The right portrait is whoever else last spoke. When a new speaker who isn't on the left talks, the right portrait cross-fades to them.
  - Portrait art faces right, so the right-hand portrait is mirrored with `transform: scaleX(-1)`.
  - Whoever isn't speaking is dimmed slightly.
- **Rewards:** shown as a final system line ("Received: Gambeson" or "Received: 25 Coin"). This is display only; §7 grants the reward.
- **Gallery:** the Gallery page (`?gallery`) gets a "Play scene" picker that lists every beat, for previewing content without meeting its conditions.

## 6. Story beats

### 6.1 Reading beats

`src/ui/engine/story.ts` (pure TS):

- `loadBeats(stories)` reads every knot's tags and returns `Beat[]`:

  ```ts
  interface Beat { id: string; thread: string; knot: string; order: number;
    activities: (ActivityId | 'socialize')[]; month: number; stats: [Estate, number][];
    rewards: Reward[]; bg?: string; left?: string }
  ```

- Knots without an `# order` tag are not beats (helper knots and stitches). Within a thread, beats are sorted by `order`.
- `validateBeats` reports unknown activities, estates, items, backgrounds and character ids, as well as duplicate orders. A content test runs it on the real files.

### 6.2 Trigger rule

`nextBeat(beats, state, activity, played)` returns at most one beat:

1. Look at each thread, and only at its **first unplayed beat**. Beats play strictly in order and never skip ahead.
2. That beat is eligible when all of these hold:
   - its `activities` includes `activity`;
   - the current campaign month is at least `month`;
   - every `stat` minimum is met, using stats **after** the activity, so a lesson that crosses a threshold triggers right away;
   - the thread's cooldown has passed: `week − (week its last beat played) ≥ cooldown`.
3. If more than one thread qualifies, the lowest file name wins. By design no two threads share an activity, so this is only a tie-break. One beat at most plays per week.

Since only the next beat in a thread is ever checked, a backlog (e.g. neglecting a job for months) drains one beat at a time, with the cooldown between them.

### 6.3 Flow after an activity

The flow lives in `GameStore.dispatch`:

1. Apply the action as today and build the result summary, adding `flavor`.
2. For `TRAIN`, `WORK` and `REST`, call `nextBeat`. **Skip** this check when:
   - the action was the forced recovery rest (the state before had `pendingConvalescence`);
   - the result has a `collapse` event;
   - the resulting phase is not `home` (deadline).
3. If there is a beat, set `ui.pendingDialog = { beatId }` and keep `ui.pendingResult` behind it. `App` draws the result popup only when no dialog is pending.
4. When the scene ends, call `store.finishBeat(beatId)`. This applies the core `STORY_BEAT` action (§7), clears `pendingDialog`, and then shows the result popup.
5. `dispatch` refuses new actions while `pendingDialog` is set, just as it does for `pendingResult`.

**Quitting or reloading mid-scene:** `pendingDialog` is UI state and is not saved, so the beat is not recorded. It will trigger again after the next matching activity. That is acceptable for the POC.

### 6.4 Social button (father–daughter)

- **Social** stays on the hub. It is enabled when `nextBeat(beats, state, 'socialize', played)` returns a beat, and greyed out otherwise (with the tooltip "Nothing to talk about yet").
- While it is enabled, the thought box shows a `thought.talk_ready` line.
- Clicking it sets `pendingDialog`, and the end of the scene calls `finishBeat`. **No week is spent**, and no result popup is shown (the reward appears as the last dialog line, §5.8).
- It is unavailable during the forced recovery week.

## 7. Core changes (rules engine)

Story rewards and played beats must go through the engine, so they are saved, validated and logged like any other change. The engine knows nothing about ink or triggers.

- **State:** `CampaignState.storyBeats?: Record<string, number>` maps beat id → the week it played.
  - It is optional, so existing `version: 1` saves load unchanged and read it as `{}`. The save format version does not change.
  - Cooldowns and "played" are both derived from it.
- **Action:** `{ type: 'STORY_BEAT'; beatId: string; reward?: { coin?: number; items?: string[] } }`.
  - Allowed only in the `home` phase, and never while `pendingConvalescence` is set.
  - Rejected with a `RuleError` if `beatId` is already recorded, if an item is not in the catalog, or if the coin amount is not a non-negative integer.
  - Records `storyBeats[beatId] = elapsedWeeks`, adds coin to the treasury (capped at 9,999 like any other gain), and adds items to the inventory.
  - Spends no week, draws no randomness, and does not break the Waxing chain (`lastWeeklyActivityId` is unchanged).
  - Granted items ignore `items.acquisition`, which only controls random pilgrimage drops.
- **Events:**
  - a new `story_beat` event (`{ beatId }`);
  - `coin_changed` with a new `CoinSource`, `'story_reward'`;
  - `item_changed` with the existing `'reward'` source.
  - Labels are added to `text/labels.ts`, so the Chronicle shows an entry ("A story: …").
- **Availability:** `STORY_BEAT` is **not** returned by `getAvailableActions`, since the engine can't know which beats exist. The store calls a dedicated `finishBeat` path that skips the `isAvailable` check but still goes through `applyAction`, so the engine's own checks apply. The simulations and the fuzz walker never emit it.
- **Trust boundary:** the engine trusts the reward the UI passes. That is fine for a single-player POC; the content test (T5) is what keeps rewards sane.
- **Persistence:** `hasPlayableState` checks that `storyBeats`, if present, is a record of non-negative integers.

## 8. Effect on balance and simulations

- Simulations run without story beats, so the balance reports stay a "no story" baseline.
- Story rewards are a small bonus on top: about 3 equipment items, 2 consumables and some Coin over the campaign.
- If they turn out to matter, a later task can teach the simulation policies about beats. That is out of scope here.

## 9. Postponed

- A father–daughter relationship stat and relationship levels for the rivals.
- Socializing as a weekly activity with date rolls.
- Ranked, condition-based thoughts. The flavor file can later change from strings to `{ text, when?, weight? }` objects without breaking anything.
- Choices with lasting effects, and story beats on the road or in the endings.
- Typewriter text, voice and music cues (these could later be added as tags).

## 10. Assets

Placeholders are fine for every new portrait. Each should be 360×540 and face right, like the existing art.

| Character | Placeholder until real art |
|---|---|
| Father (the player) | `portrait_noble_male` |
| Squire | `portrait_noble_male` (tinted) or new |
| Heretic Novice | `portrait_student_male` |
| Urchin | `portrait_damsel` or new |
| Watch Captain, Brother Librarian, Alewife, Stablemaster | `portrait_merchant_male` / `portrait_lady` or new |
| Daughter | `portrait_princess` |

Backgrounds reuse the existing `BACKGROUND` set (`home`, `school`, `job`, …). New ones can be added by registering a key in `assets.ts`.

## 11. Task / PR breakdown

Each task is one branch and PR, merged in order. Every PR includes tests (AGENTS.md).

### T1 `feature/flavor-text`: flavor text and thoughts

- `content/flavor.json` with placeholder lines at the minimum counts.
- `src/ui/engine/flavor.ts`: loading, `{scion}`/`{player}` substitution and `pickLine`.
- `ResultSummary.flavor`, filled for `TRAIN` and `WORK` in the store; `ResultPanel` shows it in italics.
- The thought box on `HomeHub` (`idle` lines only, since the talk-ready hint comes in T4).
- **Tests:**
  - the content-count test;
  - `pickLine` is deterministic for a given key;
  - success and failure lines are chosen from the `job_resolved` event;
  - flavor picking doesn't change `state.rng`.
- **Depends on:** nothing.

### T2 `feature/dialog-player`: the ink pipeline and dialog scene player

- Add `inkjs`, the `vite-plugin-ink` script (registered in both Vite and Vitest), and `ink.d.ts`.
- `src/ui/engine/dialog.ts`: the cursor (line parsing, line tags, choices, input variables).
- `src/ui/text/characters.ts`: the character registry with placeholder portraits.
- `Dialog.tsx` and its CSS: fades, background cross-fade, the text box, the arrow button, left/right portraits with mirroring and cross-fade, choices, and reduced motion.
- One sample file, `content/story/sample.ink`, and the Gallery "Play scene" picker.
- **Tests:**
  - compiling the sample;
  - the cursor turns speech, thought and narration lines into the right step;
  - `bg`/`left`/`right` tags show up on steps;
  - choices round-trip;
  - names are inserted;
  - an unknown speaker is treated as narration.
- **Depends on:** nothing (it can run in parallel with T1).

### T3 `feature/story-beat-core`: engine support

- `CampaignState.storyBeats`, the `STORY_BEAT` action, the `story_beat` event, the `'story_reward'` coin source, labels and the Chronicle entry, and `hasPlayableState` validation.
- **Tests:**
  - the beat is recorded with its week;
  - replaying a beat is rejected;
  - an unknown item is rejected;
  - coin is capped;
  - no week passes and the Waxing chain survives;
  - it is rejected outside `home` or during convalescence;
  - an old save without the field loads;
  - existing invariants and purity tests still pass.
- **Depends on:** nothing (it can run in parallel with T1 and T2).

### T4 `feature/story-beats`: triggers and flow

- `src/ui/engine/story.ts`: `loadBeats`, `validateBeats` and `nextBeat`.
- Store changes:
  - `pendingDialog`, with the result popup waiting behind it;
  - the skip rules (§6.3);
  - `finishBeat`;
  - blocking `dispatch` while a dialog is open.
- The **Social** button enable/disable rule, and the `talk_ready` thought.
- Replace the T2 sample with one real placeholder beat per thread, so the flow is testable end to end.
- **Tests:**
  - tag parsing, with defaults and errors;
  - order within a thread, including no skipping;
  - month, stat and activity gates, using post-activity stats;
  - per-thread cooldown;
  - only one beat per week;
  - the skip rules (forced recovery rest, collapse, deadline);
  - Social spends no week;
  - the reward reaches the treasury and inventory through the engine;
  - a reload mid-scene leaves the beat unplayed.
- Extend a Playwright check script (`scripts/check-*.cjs`) to play one beat.
- **Depends on:** T2 and T3.

### T5 `feature/story-content`: placeholder story content

- Placeholder beats for every thread in §3:
  - 4–5 each for knight, cloister and alley;
  - about 3 for the stables;
  - about 7 for the father.
- Starting trigger values. Spread months across the 24-month campaign, and raise stat minimums gradually (e.g. 20 → 30 → 40 → 55 → 70).
- Rewards: grand items on the penultimate or last beat.
- Placeholder portraits and character entries.
- A content test: every beat validates, every thread has 3 or more beats, and every grand item exists in `content/items.json`.
- Update the README (how to write a beat, the tag reference, how to preview in Inky and the Gallery).
- **Depends on:** T4.
