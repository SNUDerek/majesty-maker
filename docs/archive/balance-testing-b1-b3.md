# Balance testing B1–B3: reviewed delivery record

Completed in PR #29. The [active plan](../balance-testing.md) retains the gate,
conditional R1–R3 work, and final tuning/confirmation E1.

- B1: build presets with build targets, mandatory ending floors, departure readiness,
  capped tutor budgets and carried-Coin budgets. Published policies retain their results.
- B2: achieved profiles, lesson spending, road/card/purse metrics, win-by-week and
  paired differences with 95% intervals.
- B3: S3/S4 overlays, stages 0–1 runner and analysis, and the
  [interim report](../balance-report-stage1.md).

Review fixes: exhausted tutor budgets cannot bypass an ending floor; duplicate
seeds in either paired group are rejected; invalid worker counts fail promptly;
manifests record running/failed/complete status; analysis validates expected task
files, seed coverage and record labels, and refuses incomplete stages.

Budget probes compare equal spending caps, with actual spend printed beside them.
They relax shape targets when no more tutoring fits the cap, but never relax the
ending floor. They do not establish equal realized-spend balance. No game rules or
defaults change, and the designer's stage gate remains pending.

Reviewed by Codex (OpenAI).
