# Open questions: follow-up tasks

The settled Q1–Q13/R1–R5 decisions and reviewed T1–T7 delivery record are in
[the archive](archive/open-questions-tasks.md). The engine implements the rules;
`rules.experimental.json` selects the candidate and shipped defaults retain legacy controls.
See [the baseline report](balance-report-baseline.md) for evidence and limitations.

## Remaining balance acceptance (T6/T7)

- [ ] Increase close comparisons to 5,000 runs per policy/sign as specified by T6/F1.
  The initial 1,000-run comparisons are preserved; small effects remain provisional.
- [ ] Evaluate skips and home-collapse fees using separate policies that exercise them.
  Existing bots never use skips or collapse at home. Keep policy changes separate from rule comparisons.
- [ ] Review these results before treating numeric tuning as complete. The candidate is
  an experimental baseline; specialist dominance remains unresolved.

The archived checkboxes record the initial batch and experimental promotion, not
completion of this outstanding validation. Reproduction scripts live in
[`scripts/open-questions`](../scripts/open-questions).

### T8 — Separate follow-up: first-waystation item experiment

**Decision:** Defer this feature from the baseline PRs, but use the following concrete experiment when implementing acquisition. This replaces an unconditional grant and per-encounter drops for the initial experiment.

- [ ] Add an opt-in acquisition mode: one 25% reward chance on first securing each regular waystation. No repeat/retry/finale grants, and no draws while acquisition is disabled. Append a dedicated item stream after the existing `jobs`, `encounters`, and `rewards` RNG streams, preserving their seed derivation; test that acquisition does not perturb encounter/check/Coin-loot draws. Update state contracts and fixtures for the added stream.
- [ ] Add a separate experiment reward table with weight 2 per consumable and 1 per equipment item. Keep `testRewardTable` equal-weight behavior as a fixture, with no implied production rarity. Validate chance bounds, item IDs, weights, and positive total weight.
- [ ] Award successful draws to persistent home inventory, emit an item-grant event, and leave currently carried slots unchanged. Secured grants survive later retreat/wipeout; consumables already carried still follow ordinary wipeout rules. Returning home is required to select newly awarded supplies for a later departure.
- [ ] Wire acquisition into checkpoint securing in `pilgrimage.ts`; use secured progress to prevent repeat grants. Do not merely enable the current `items-test-table` variant: `drawItemReward` currently has no campaign caller.
- [ ] Test first/repeat arrivals, no-drop/drop boundaries, disabled-mode RNG stability, no finale grants, item ownership across return/wipeout, slot limits, and deterministic replay. Compare against item-free and explicitly labeled starting-inventory experiments on paired seeds.
- [ ] Report grants, use, and outcome effects separately from acquisition frequency. Five reached waystations imply an expected 1.25 grants at 25%, not 1.25 for every campaign. Keep chances/weights experimental until evaluated; update docs and provenance when the feature actually ships.

**Depends on:** T7 for evaluation against a stable baseline. This work must have its own tests and implementation PR.

*Reviewed by Codex (OpenAI).*
