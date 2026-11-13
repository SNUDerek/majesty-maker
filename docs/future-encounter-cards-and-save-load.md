# Future Design Notes: Encounter Cards and Save/Load

**Status:** notes for the next planning phase. Nothing here is approved or scheduled.
**Context:** both topics are missing from the current design documents. This file records how the Phase 0 engine handles them today and what extending them would take. It is meant to be revisited during the next planning phase and folded into the design documents once decisions are made.

---

## 1. Encounter cards

### Current behaviour

An encounter card is nothing but its threat Estate (red Bellatores, blue Oratores, green Laboratores).

- On reveal, `drawThreat` in `src/core/pilgrimage.ts` draws an Estate from the weighted `encounters.distribution`, using the `encounters` RNG stream. The result is stored as `PilgrimageState.currentThreat`.
- The player picks an approach Estate. Every card then resolves the same way:
  - **Odds:** the matchup multiplier, the road bonus and item hooks set the probability, clamped to 5–95%.
  - **Roll:** one d100, roll-under.
  - **Success:** +1d4 Coin to carried Coin.
  - **Failure:** a penalty of 15, taken from the approach's resource (Fatigue, Melancholy or carried Coin). Full Moon doubles burden penalties.
- Cards have no identity. Tech §14 lists `content/encounters.json` as an optional file ("optional concrete cards, initially generated types"), and it was never created. Tech §7 anticipates the extension: "Later replace/add card-specific rewards, items, and modest condition relief."

### Extension A: variants of the coloured cards

*Example:* "Brigands" is a red card that pays extra Coin on success.

This fits the current architecture and is roughly one task.

- **Card catalog:** add `content/encounters.json`. Each card has:
  - an `id` and a display name;
  - its threat Estate;
  - a draw weight;
  - optional modifiers: success points, a reward bonus or different reward die, a penalty percent, an item reward, and condition relief.
- **Config:** load the catalog into `RulesConfig` with validation and provenance, the same way `items.json` is loaded. The catalog is then hashed and included in every report's config snapshot.
- **Drawing:** draw a card instead of a bare Estate. Store `currentCardId` next to `currentThreat`.
- **Resolution:** apply the card's modifiers by reusing the probability and penalty hook pattern that the items already use in `src/core/items.ts`.
- **Events:** add `cardId` to `encounter_drawn` and `encounter_resolved`.
- **Unaffected:** threat colour, matchups, E2 metrics and the E3 bots keep working. Per-card metrics can be added later.

### Extension B: a neutral (fourth-colour) card type

*Example:* "Toll Bridge: pay 3 Coin". No approach and no roll.

This is possible but larger, because the pilgrimage state machine assumes every card means choosing an approach and then rolling. `threat` is typed as `Estate` throughout. Affected areas:

- **Engine:**
  - a card `kind` (for example `contest` or `event`);
  - a new pilgrimage stage and action (for example "pay / accept") with its effects;
  - available-action generation.
- **Events:** `encounter_resolved` assumes a threat and an approach, so a separate event is needed (for example `event_card_resolved`).
- **E2 metrics:** encounter tallies are keyed by threat and approach, and matchup shares assume a colour.
- **E3 bots:** Pragmatic's survival estimate assumes every card is a contested Estate threat.
- **Other:** the D1 invariant checker, the E4 trace formatting, and the D2/D3 scenario and fuzz tests.

Rules questions to settle first:

1. Does an event card count toward the segment's N encounters?
2. If carried Coin is below the toll, is that a wipeout (consistent with a failed Laboratores card), a payment from the treasury, or a forced retreat?
3. Can the New Moon skip be used on event cards?
4. Does Purse Protection or the Weighted Coin reduce tolls?
5. Should event cards ever offer a choice (for example "pay 3 Coin or take 10 Fatigue")?

### Notes

- Any change to card draws changes outcomes for the same seed, so baselines must be rerun. Paired-seed comparisons are only valid within one card catalog.
- Tech §7 says not to counter the player's build dynamically by default. Card weights should stay static or be a declared configuration choice.
- **Suggested order:** document the card model in the design docs, implement Extension A, then decide on Extension B once the rules questions above are answered.

---

## 2. Save and load

### Current behaviour

The engine already supports saving and loading in principle:

- `CampaignState` is plain JSON (no classes, dates or functions) and includes the RNG stream states.
- `JSON.stringify(state)` followed later by `applyAction(JSON.parse(saved), …)` continues the campaign deterministically, including in the middle of a pilgrimage.
- The D3 fuzz tests already check byte-identical replay.
- `CampaignState.version` (currently `1`) exists to support future migrations.

The tech doc assigns save/load to the Phase 1 browser PoC: "local save/load, downloadable/importable JSON saves" (tech §1, §15; implementation-tasks §6). No core save/load API was planned for Phase 0.

### Gaps for robust saves

- **Validation on load:** nothing validates a loaded state. A corrupted or edited file could crash the engine or quietly break the rules. The invariant checker (`src/tests/invariants.ts`) could be promoted into core as `validateState()`.
- **Config binding:** a save doesn't record which rules config it was played under, so loading after balance changes would silently mix rule sets. Wrap saves in an envelope such as `{ saveVersion, configId, savedAt?, state }` and warn or refuse when `configId` doesn't match.
- **Migrations:** define what happens when `CampaignState.version` changes (migrate, or refuse with a clear message).
- **Reloading to re-roll:** because the RNG state is saved, reloading reproduces the same next roll. That prevents re-rolling an encounter by reloading. However, the player can learn the upcoming roll and then choose a different approach or action. Options:
  - accept it, as single-player tolerance;
  - only allow saving at home and at waystations;
  - re-seed the next draw on load (which breaks determinism and replay).

### Suggested core task (before or at the start of Phase 1)

- `src/core/save.ts` with `serializeSave(state, config)` and `loadSave(json, config)`:
  - envelope with a save version and the config hash;
  - state validation;
  - a version check, with a migration hook.
- Round-trip tests: save at home, mid-pilgrimage and at a waystation; load and continue; the result must be byte-identical to an uninterrupted run. Rejection tests for a corrupted state, a mismatched config and an unknown version.
- The Phase 1 UI then only handles storage (localStorage, file download and import).

### Decisions needed

1. Where may the player save (anywhere, home only, or home and waystations)?
2. On a config mismatch: refuse, warn and continue, or continue silently?
3. How many save slots, and is there an autosave?
