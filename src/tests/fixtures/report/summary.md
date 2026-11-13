# Simulation summary

Config: `96200e1e7e3ea9fd`. Runs: 5. Git commit: `1111111111111111111111111111111111111111`.

Astrology: **partial astrology**. Disabled parameters: `astrology.fullMoon.surge`, `astrology.newMoon.activityBonus`, `astrology.newMoon.skipFee`.

The full effective rules, unresolved assumptions, policy params and unrounded aggregates are in `summary.json`. Strategy comparisons require paired seeds and comparable configs; diagnostic flags indicate observations, not proven balance defects.

## Reproduction

```sh
npm run sim -- --policy fixture-pilgrim --birth-sign aries --runs 5 --seed 123 --strict --out reports/golden
```

Use the literal seed, policy and sign from a CSV row to inspect a run:

`npm run sim -- --policy <policy> --birth-sign <sign> --trace-seed <seed> --out <directory>`

Reuse the original `--config`, `--variant`, `--weeks` and policy parameters. If those inputs changed, restore the effective config snapshot from `summary.json` with `--config <snapshot.json>`.

## Outcomes

| Policy | Sign | Runs | Victory | 95% Wilson CI | Win week median | Final cards mean | Deadline / resource loop / unfinished |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-pilgrim | aries | 5 | 80.0% | 37.6%–96.4% | 2 | 7.8 | 0 / 1 / 0 |

Win weeks include winners only. Resource-loop attribution uses the metrics closing-window heuristic (default 24 weeks). An “all” row pools signs for that policy.

## Checkpoints

| Policy | Sign | Furthest checkpoint (runs) | First reach: checkpoint / runs / median week |
| --- | --- | --- | --- |
| fixture-pilgrim | aries | 1: 5 | 1 / 5 / 1 |

## Risk and recovery

| Policy | Sign | Wipeouts/run | Causes F/M/both/Coin | Retreats/run | Home collapses/run | Convalescence weeks | Medical / physician fees paid per run | Empty treasury runs | Medical / physician shortfall | Skips/run | Failed departures/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-pilgrim | aries | 0.80 | 4/0/0/0 | 0.00 | 0.00 | 0.8 | 0.4 / 0.0 | 100.0% | 100.0% / — | 0.00 | 0.00 |

Empty treasury includes runs with carried Coin remaining; medical shortfall is a fraction of wipeouts, physician shortfall a fraction of home collapses. Skips are New Moon bribes and are never counted as encounter rolls. Failed departures are only counted when the caller supplies rejected attempts to metrics; the standard runner records accepted actions.

## Stats and economy

| Policy | Sign | Median B/O/L | Coin earned/spent/lost per run | Advantage/neutral/disadvantage share |
| --- | --- | --- | --- | --- |
| fixture-pilgrim | aries | 40.0/35.0/35.0 | 26.0/16.4/31.2 | 35.5%/31.6%/32.9% |

## Calendar utilization

| Policy | Sign | Training | Jobs | Rest | Adventure | Convalescence | Unused |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-pilgrim | aries | 0.0% | 11.7% | 0.0% | 21.7% | 6.7% | 60.0% |

## Flagged anomalies

| Policy | Sign | Flag | Affected runs | Observation |
| --- | --- | --- | --- | --- |
| fixture-pilgrim | aries | zero_treasury | 5 | At least one spent week ended with empty treasury; carried Coin may remain. |
| fixture-pilgrim | aries | medical_fee_shortfall | 2 | At least one wipeout medical fee could not be paid in full. |
| fixture-pilgrim | aries | resource_loop | 1 | Deadline attributed to a closing resource loop (metrics heuristic, default 24-week window). |
