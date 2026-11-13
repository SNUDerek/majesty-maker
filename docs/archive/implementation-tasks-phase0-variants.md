# Phase 0 — completed E6 configuration variants task

### E6 Configuration variants
- **Depends on:** T0.3. **Parallel with:** nearly everything.
- **Files:** `content/variants/*.json`.
- **Work:** named variants for route length 4, 5, and 6; flat versus steep road bonus curves; final N of 6, 8, and 10 and final road bonus of −10, −20, and −30; `items-test-table`; `astrology-full` (enables the TBD lunar bonuses with candidate values); and `weeks-48`.
- **Acceptance:** all variants validate and their hashes differ.


Completed and reviewed in PR #26. Every overlay has an id matching its filename, distinct configuration hash, and provenance for modified values. `route-5`, `final-n8`, and `final-road-20` are baseline controls whose metadata distinguishes them from the default configuration. The default rules remain unchanged.

Road variants halve/double the default slope while preserving its mean of +20 and require five regular segments. Variants apply in order: applying `road-flat` or `road-steep` after `route-4`/`route-6` fails validation; applying a route variant last replaces the earlier curve with its own matching linear curve. Other sensitivity settings can be stacked independently.

`astrology-full` supplies experimental 10% New Moon and Full Moon gain/payout multipliers (×1.1), plus a 10-Coin New Moon skip fee. Integer flooring still applies, so a small gain may remain unchanged. `weeks-48` changes calendar length only; 96 weeks remains canonical and the deadline age is unchanged.

Tests cover all named variants, distinct hashes, changed-value provenance, complete strict-invariant campaigns, CLI loading over `rules.experimental.json`, stacking order and invalid combinations, and a combined sensitivity campaign. README documents the variants and CLI composition.
