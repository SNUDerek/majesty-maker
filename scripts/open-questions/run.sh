#!/usr/bin/env bash
# T6 matrix: 1000 runs x 7 policies x 12 signs per config, strict, paired seeds.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=${1:?usage: run.sh output-directory [runs-per-sign]}
RUNS=${2:-1000}
mkdir -p "$OUT"
E=content/experiments/open-questions
run() { local name=$1; shift
  node --import tsx src/simulation/cli.ts --all-policies --all-signs --runs "$RUNS" --seed 20261113 --strict --config content/rules.legacy.json "$@" --out "$OUT/$name" > "$OUT/$name.log" 2>&1
  echo "$name exit=0" >> "$OUT/done.txt"; }
run control
for o in q1-burden q2-protection q4-waxing q5-square q9-skip-5 q9-skip-10 q12-home-10 q12-home-20 r3-toll q13-wipeout q13-home-fee; do run "$o" --variant $E/$o.json; done
run candidate --variant open-questions-decisions
run x-lab --variant $E/q1-burden.json --variant $E/q2-protection.json --variant $E/q9-skip-10.json
run x-square-lunar --variant $E/q5-square.json --variant $E/q4-waxing.json --variant $E/q12-home-20.json
run x-failure --variant $E/r3-toll.json --variant $E/q13-wipeout.json --variant $E/q13-home-fee.json
run cand-n10 --variant open-questions-decisions --variant final-n10
run cand-road30 --variant open-questions-decisions --variant final-road-30
run cand-n10-road30 --variant open-questions-decisions --variant final-n10 --variant final-road-30
echo ALL_DONE >> "$OUT/done.txt"
