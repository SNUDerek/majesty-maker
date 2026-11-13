# Balance-testing overlays (docs/balance-testing.md)

Single-change overlays applied over the **experimental baseline** (`content/rules.experimental.json`), which itself sits over `content/rules.default.json`. Each has its own `id`, so config hashes differ.

| File | Selected change | Change |
|---|---|---|
| `s3-opp0.json` | S3 | tutor opposing loss 1 → 0 for all three tutors |
| `s4-dis60.json` | S4 | `encounters.matchupPct.disadvantage` 75 → 60 |
| `s4-dis50.json` | S4 | `encounters.matchupPct.disadvantage` 75 → 50 |

Stage 1 stacks S3 with each S4 value. The stage scripts are in `scripts/balance-testing/`; a single comparison can also be run from the CLI with a build preset:

```sh
npm run sim -- --policy hybrid-b --all-signs --runs 1000 --seed 20261113 --strict \
  --config content/rules.experimental.json --variant content/experiments/balance/s3-opp0.json
```
