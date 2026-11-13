"""T6 analysis: paired-seed comparisons of each config against the control.

usage: python3 -I analyze.py <t6-dir> > tables.md
Reads <dir>/<config>/runs.csv and summary.json. Prints Markdown tables.
"""
import csv, json, math, sys, os
from collections import defaultdict

csv.field_size_limit(1 << 30)
D = sys.argv[1]
POLICIES = ['stables-only', 'specialist-b', 'specialist-o', 'specialist-l', 'balanced', 'reckless', 'pragmatic']
CONFIGS = ['control', 'q1-burden', 'q2-protection', 'q4-waxing', 'q5-square', 'q9-skip-5', 'q9-skip-10',
           'q12-home-10', 'q12-home-20', 'r3-toll', 'q13-wipeout', 'q13-home-fee', 'candidate',
           'x-lab', 'x-square-lunar', 'x-failure', 'cand-n10', 'cand-road30', 'cand-n10-road30']


def load(name):
    runs = {}
    with open(os.path.join(D, name, 'runs.csv'), newline='') as f:
        for r in csv.DictReader(f):
            runs[(r['policy'], r['birthSign'], r['seed'])] = r
    summary = json.load(open(os.path.join(D, name, 'summary.json')))
    return runs, summary


def wilson(k, n):
    if n == 0:
        return (float('nan'),) * 3
    z = 1.959964
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, c - h, c + h


def paired(ctrl, cand, policy):
    diffs = []
    for key, r in cand.items():
        if key[0] != policy:
            continue
        c = ctrl[key]
        diffs.append((r['outcome'] == 'victory') - (c['outcome'] == 'victory'))
    n = len(diffs)
    m = sum(diffs) / n
    var = sum((x - m) ** 2 for x in diffs) / (n - 1)
    h = 1.959964 * math.sqrt(var / n)
    return m, m - h, m + h, n


def pct(x):
    return f'{100 * x:.1f}'


data = {name: load(name) for name in CONFIGS if os.path.exists(os.path.join(D, name, 'runs.csv'))}
ctrl_runs, ctrl_sum = data['control']

print('## Config hashes\n')
print('| Config | configId | runs | git |')
print('|---|---|---|---|')
for name, (_, s) in data.items():
    print(f"| {name} | `{s['configId']}` | {s['runCount']} | `{(s['gitCommit'] or '')[:10]}` |")

print('\n## Victory rate by policy (all signs), percent, and paired difference vs control (pp, 95% CI)\n')
print('| Config | ' + ' | '.join(POLICIES) + ' |')
print('|---|' + '---|' * len(POLICIES))
for name, (runs, _) in data.items():
    cells = []
    for p in POLICIES:
        group = [r for k, r in runs.items() if k[0] == p]
        wins = sum(r['outcome'] == 'victory' for r in group)
        rate = wins / len(group)
        if name == 'control':
            cells.append(pct(rate))
        else:
            m, lo, hi, _ = paired(ctrl_runs, runs, p)
            mark = '' if lo <= 0 <= hi else ' **'
            cells.append(f'{pct(rate)} ({m * 100:+.1f} [{lo * 100:+.1f}, {hi * 100:+.1f}]){mark}')
    print(f'| {name} | ' + ' | '.join(cells) + ' |')

print('\n`**` = paired 95% CI excludes zero.\n')


def allrow(summary, policy):
    return next(a for a in summary['aggregates'] if a['policy'] == policy and a['birthSign'] == 'all')


print('\n## Risk, recovery and economy per run (pooled over all policies except stables-only)\n')
cols = ['win wk med', 'checkpoint mean', 'wipeouts', 'retreats', 'home collapses', 'conval wk', 'rest wk',
        'medical paid', 'physician paid', 'skips', 'zero-treasury runs %', 'resource-loop %', 'final treasury']
print('| Config | ' + ' | '.join(cols) + ' |')
print('|---|' + '---|' * len(cols))
for name, (runs, s) in data.items():
    group = [r for k, r in runs.items() if k[0] != 'stables-only']
    n = len(group)
    f = lambda k: sum(float(r[k] or 0) for r in group) / n
    weeks = sorted(int(r['victoryWeek']) for r in group if r['victoryWeek'])
    med = weeks[len(weeks) // 2] if weeks else float('nan')
    fees = defaultdict(float)
    for r in group:
        for src, v in json.loads(r['coinBySource']).items():
            fees[src] += v
    row = [med, f('furthestWaystation'), f('wipeouts'), f('retreats'), f('homeCollapses'), f('weeks.convalescence'),
           f('weeks.rest'), -fees['medical_fee'] / n, -fees['physician_fee'] / n, f('encountersSkipped'),
           100 * sum(int(r['zeroTreasuryWeeks']) > 0 for r in group) / n,
           100 * sum(r['failureAttribution'] == 'resource_loop' for r in group) / n, f('finalTreasury')]
    print(f'| {name} | ' + ' | '.join(f'{v:.2f}' if isinstance(v, float) else str(v) for v in row) + ' |')

print('\n## Approach Estate share of encounter outcomes (pooled, non-stables policies)\n')
print('| Config | Bellatores | Oratores | Laboratores |')
print('|---|---|---|---|')
for name, (_, s) in data.items():
    tot = defaultdict(int)
    for a in s['aggregates']:
        if a['birthSign'] != 'all' or a['policy'] == 'stables-only':
            continue
        for key, e in a['encounters'].items():
            tot[key.split(':')[1]] += e['attempts']
    t = sum(tot.values()) or 1
    print(f"| {name} | {pct(tot['bellatores'] / t)} | {pct(tot['oratores'] / t)} | {pct(tot['laboratores'] / t)} |")

print('\n## Victory rate by birth-sign Estate group (candidate vs control), percent\n')
groups = {'bellatores': ['aries', 'cancer', 'libra', 'capricorn'], 'oratores': ['taurus', 'leo', 'scorpio', 'aquarius'],
          'laboratores': ['gemini', 'virgo', 'sagittarius', 'pisces']}
print('| Config | Policy | Bellatores signs | Oratores signs | Laboratores signs |')
print('|---|---|---|---|---|')
for name in ['control', 'candidate']:
    runs, _ = data[name]
    for p in POLICIES:
        cells = []
        for g, signs in groups.items():
            group = [r for k, r in runs.items() if k[0] == p and k[1] in signs]
            cells.append(pct(sum(r['outcome'] == 'victory' for r in group) / len(group)))
        print(f'| {name} | {p} | ' + ' | '.join(cells) + ' |')
