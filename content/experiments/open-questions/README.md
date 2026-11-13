# Open-questions experiment overlays (T6)

Small single-change overlays over the **legacy control** (`content/rules.default.json`), used by the controlled comparisons in [docs/balance-report-baseline.md](../../../docs/balance-report-baseline.md). Each changes exactly one decision from [the decision record](../../../docs/archive/open-questions-tasks.md) and has its own `id`, so config hashes differ. They are passed by path, for example:

```sh
npm run sim -- --all-policies --all-signs --runs 1000 --seed 20261113 --strict \
  --variant content/experiments/open-questions/q5-square.json --out reports/q5-square
```

Interaction checks stack several overlays in one command. The combined candidate is `content/variants/open-questions-decisions.json`.
