# UI Playtest Follow-up — Plan

**Status:** PR 1 (P1–P6) merged (#34); PR 2 (C1–C3) in review (#35); PR 3 (I1–I2) implemented on `feature/ui-intro`; PR 4 planned. Open questions (§8) keep their defaults: no approach verbs, grey condition text, tutorial flag per browser.
**Source:** [ui-feedback.md](ui-feedback.md) (first playtest) and the follow-up discussion. Builds on the shipped playtest UI ([ui-technical-plan.md](ui-technical-plan.md), PRs #31–#33).
**Scope:** presentation and UI-layer features only. No change to `src/core` or the rules. The setup screen rework, emoji/icon sets and a calendar view are out of scope (§7).

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Parchment | Keep the Kenney frame + parchment fill. Stop cropping the texture: draw it at `background-size: 100% 100%` so its drawn edge always lands at the same fraction of the panel, then pad content inside that edge. No 9-slice (the texture isn't made for it; stretching is acceptable). |
| Condition gauges | Kenney bars, like the Estates. **Fatigue red, Melancholy blue** (shared with Bellatores/Oratores for now; the owner will supply re-hued and darkened bar PNGs later). The ceiling is an overlay; approximate placement is fine since the numbers are printed. |
| Estate colour in text | Yes, wherever stat numbers appear (§3.3). Condition changes in muted grey. No emoji for now. |
| Option lists | **Single column** on Home, Work and Rest. Tutors keep three portrait cards. |
| Event log | Yes: a per-save **Chronicle**. Existing saves need no migration (they open with an empty log). |
| Intro | Rework to the owner's layout (§4). Letter-by-letter text is in scope. |
| Pilgrimage tutorial | One-time multi-page parchment pop-up + "?" button; Prep loses its tutorial text (§5). |
| Encounter flavour | Rewrite so a card's colour is **who** the threat is, matching the thematic doc's triangle (§3.6). |

---

## 2. Branches and PRs

Each PR has its own branch and worktree, starts from `main`, and commits task by task.

| PR | Branch | Tasks | Depends on |
|---|---|---|---|
| 1 | `feature/ui-polish` | this plan + P1–P6 | — |
| 2 | `feature/ui-chronicle` | C1–C3 | PR 1 (uses the stat-colour styles) |
| 3 | `feature/ui-intro` | I1–I2 | PR 1 (uses the unframed parchment) |
| 4 | `feature/ui-pilgrimage-tutorial` | T1–T2 | PR 3 (reuses the unframed parchment pages) |

PRs 2 and 3 are independent of each other.

---

## 3. PR 1 — Polish

### P1. Parchment margins

Measured on `assets/misc/parchment_1600x1080.webp` (alpha scan through the middle rows/columns): the paper starts about **4%** in from the left, **2–2.5%** from the right, **1–3%** from the top (more at the top-left curl) and **5–7%** from the bottom.

- `.panel--parchment`: `background-size: 100% 100%` (was `cover`, which cropped the edges differently on every panel shape and pushed text past the drawn edge on tall panels).
- Content inset inside the Kenney frame, in logical px, starting from: left `max(5%, 20px)`, right `max(3.5%, 14px)`, top 18px plus extra clearance under the curl for the title row (`.panel__title` indented ~28px), bottom `max(7%, 18px)`. Tune by screenshot at each panel size in use: side panel (340×640), activity preview (400×640), centre panels (560–820 wide), modals (520/820 wide).
- Vertical panels (side panel, preview): right-align numbers and meters so nothing sits in the uneven right margin; meters stop short of the right inset.
- Acceptance: at 1280×720 no text, bar or button crosses the paper's drawn edge or the curl on any screen.

### P2. Condition gauges on Kenney bars

- `ConditionGauge` renders the same three-part Kenney `Bar` used for Estates: **red** for Fatigue, **blue** for Melancholy, on the `barBack` track.
- Layers, bottom to top: track → fill to *current* → a second fill at ~45% opacity from current to *projected* (previews only) → a hatched overlay from the ceiling to 100 with a dark ceiling tick.
- The overlay sits inside the bar's transparent margin, roughly matching the track, not pixel-exact. The `value / ceiling` label and "Near collapse" text stay.
- `BAR_COLOUR` for conditions is one map in `assets.ts`, so swapping in the owner's re-hued PNGs later is a one-line change.

### P3. Stat colours and the card layout

- New `StatText` component: a coloured Estate name (or icon + name) with a signed amount, e.g. **Bellatores +6** in `--bellatores`. Fatigue/Melancholy changes use `--muted-cost` (grey). Coin is always the coin glyph + amount, never the word "Coin" as well.
- Used on activity cards, the preview's outcome lists, result panels, the retreat confirm, the encounter approach lines and the Outcome screen.
- **Card body layout** (Tutor/Work/Rest), one fact type per line:
  1. Estate gains (coloured)
  2. Condition changes (grey)
  3. Coin: fee or pay (glyph), shown **once**
  4. Job chance / "Automatic" (Work only)
- `outcomeLines` becomes structured (`{kind: 'estate'|'condition'|'coin', …}[]`) so the components can colour by kind; string output stays for tests.

### P4. Single-column option lists

- Home menu: one column (Tutoring, Work, Rest, Pilgrimage, then a greyed "Social — later" row), so new activities add a row.
- Work and Rest: one card per row with name, icon or portrait thumbnail at left, lines from P3 at right. Four rows fit in the left column at 720p without scrolling; the preview panel stays on the right.
- Tutor: unchanged (three tall portrait cards).

### P5. Home side panel

- "Estates" and "Condition" headings in Canterbury (`--font-head`), not italic.
- Name line shows the full name: `scionName + ' ' + playerName.last` (e.g. "Elaine Wyke"), via one `fullName(state)` helper used anywhere the daughter is named in full.

### P6. Encounter flavour lines

The thematic triangle: **Bellatores beat Laboratores** (force, noble stature), **Laboratores beat Oratores** (supplies, dirty tricks), **Oratores beat Bellatores** (the Church binds the nobility). A card's colour names the *adversary's* order; the right answer then reads naturally. Replace `THREAT_FLAVOUR` with people or factions of that order, three lines each, for example:

| Card | Is… | Natural answer |
|---|---|---|
| Laboratores (green) | poachers in the king's wood; a mob of angry villeins; a smugglers' gang on the ford | Bellatores: drive them off |
| Oratores (blue) | a grasping pardoner; a friar who wants papers; a tithe-collector at the bridge | Laboratores: forge, bribe, out-trade |
| Bellatores (red) | a robber knight; deserters at the crossroads; a lord's men-at-arms | Oratores: an oath, sanctuary, the Truce of God |

No task-shaped lines ("a bridge needs mending"). A test asserts three lines per Estate.

**Open:** per-approach verbs on the approach buttons (§8, Q1).

### PR 1 tests

- Unit: structured `outcomeLines` kinds and order; `fullName`; flavour line counts.
- `scripts/check-ui.cjs`: no element inside a `.panel--parchment` overflows the panel's padding box (bounding-box check on Home, an activity preview, a result, Prep); gauge fill widths follow value/ceiling.
- Screenshot review at 1280×720 and 1920×1080 for each screen touched.

---

## 4. PR 2 — Chronicle (event log)

### C1. Entries (pure, `src/ui/engine/chronicle.ts`)

```ts
interface ChronicleEntry {
  week: number;              // elapsedWeeks before the action
  action: GameAction;
  title: string;             // "The Alehouse: failure", "Departed for Road to Waystation 2", "A Bellatores threat"
  detail?: string;           // "Rolled 72 against 50%."
  rows: { quantity: Quantity; amount: number }[];   // net changes
  notes: string[];
}
chronicleEntry(before: CampaignState, action: GameAction, events: GameEvent[], config): ChronicleEntry
```

- Every action is logged, including the ones that have no result panel: departure (destination and carried Coin), each revealed threat, remedies used, and continuing to a segment. It reuses `summarize` where a summary exists.
- Raw events are not stored (size). The dev panel's "Last events" stays for debugging.

### C2. Storage

- `GameStore` holds `log: ChronicleEntry[]` in the snapshot; `dispatch` appends; `newGame` clears; `load` restores.
- `SaveFile` gains an optional `log` (missing = empty), written by autosave and manual saves. No format bump; per the owner, older saves don't need migrating.
- Size check in tests: a full 96-week campaign's log stays well under 200 KB of JSON.

### C3. Chronicle overlay

- "Chronicle" button beside Menu on the top bar and pilgrimage HUD.
- Parchment overlay, newest first, grouped by month ("March 1450") then week, with one line per action and coloured `StatText` rows. Shown in pages or a scroll area inside the parchment insets.
- Tests: entry text for each action type (home, departure, reveal, approach, reroll, skip, remedy, retreat, waystation, wipeout, victory, deadline); store append/clear/restore; the save round-trip includes the log; a seeded full campaign produces one entry per action.

---

## 5. PR 3 — Intro rework

### I1. Layout

- Stage background **black** (no title art).
- **Unframed parchment**: the texture alone at `100% 100%`, about **620 px tall** (86% of 720) and ~920 px wide, centred. Shared `ParchmentSheet` component (also used by PR 4), with insets from P1.
- Picture centred near the top inside the paper, about **400×300** (≈55% of today's 708×531), thin dark border.
- Text below the picture, within the insets, 22 px body.
- Controls along the paper's bottom edge: the `N / 10` counter (kept), *Skip*, *Next* / *Begin*.

### I2. Motion

- Picture: fade out / fade in (~300 ms) between panels.
- Text appears letter by letter (~40 chars/s). Click / Space / Enter first completes the line, the next press advances. Esc / *Skip* jumps to setup.
- `prefers-reduced-motion`: no fades, text appears whole.
- Tests: the reveal-state reducer (pure: `revealed`, `complete`, `advance`) unit-tested; `check-ui.cjs` steps through the intro with Enter (complete, then advance).

---

## 6. PR 4 — Pilgrimage tutorial

### T1. Tutorial pages

A `ParchmentSheet` pop-up with *Back* / *Next* / *Close*, 4 pages:

1. **The road**: five waystations, then the Final Gauntlet; each segment costs one week to enter; secured waystations are kept.
2. **The three orders**: the triangle from P6 with the three icons; card colour = who the threat is; Advantage ×1.5 / Even / Disadvantage ×0.75; the road bonus.
3. **Failure**: Bellatores → Fatigue, Oratores → Melancholy, Laboratores → carried Coin; reaching a ceiling or being unable to pay is a wipeout; Purse Protection.
4. **Moon and retreat**: the moon is fixed at departure (New: one bribe; Full: ×2 advantage and ×2 strain); retreat keeps the Coin carried from home and part of the loot, and costs a toll.

Numbers come from the config (`times()`, `config.encounters.matchupPct`, etc.), not hard-coded.

### T2. Triggers and the slimmer Prep

- Opens automatically the first time Prep opens in this browser (`localStorage` key `hidden-scion:seen:pilgrimage-tutorial`; failures to read or write mean "show it"). A **?** button on Prep and on the pilgrimage HUD reopens it.
- Prep keeps only: route strip, next segment name / encounter count / road bonus, this week's moon in one line, Provisions. The explanatory paragraph moves into the tutorial.
- Tests: the page content builder is pure and config-driven (unit test against shipped values); `check-ui.cjs`: the first Prep visit shows the tutorial, the second doesn't, and "?" reopens it.

---

## 7. Out of scope (recorded)

- Setup screen rework (owner will design).
- Emoji or an icon set for stats and conditions (needs two condition icons).
- Calendar view (the Chronicle data is the basis for it later).
- Re-hued bar art (owner; P2 makes it a drop-in).

---

## 8. Open questions

1. **Approach verbs.** Add a short verb per approach and threat on the encounter buttons (9 lines, e.g. vs a green card: Bellatores "Drive them off", Oratores "Preach at them", Laboratores "Strike a bargain")? They teach the triangle in play. Not planned until approved.
2. **Condition text colour.** Grey is the default (§3.3). With red/blue gauges, the alternative is to tint the text to match the bars. Default stays grey unless the owner prefers the tint.
3. **Tutorial "seen" scope.** Per browser by default (§6 T2); per campaign is the alternative.
