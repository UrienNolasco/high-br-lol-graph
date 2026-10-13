// Three alternating rounds; preserve an original build at .tmp/write-optimization/baseline-dist first.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const base = path.join(root, '.tmp/write-optimization');
const snapshots = {
  baseline: path.join(base, 'baseline-dist'),
  full: path.join(root, 'dist'),
};
for (const phase of ['events', 'stats']) {
  const target = path.join(base, phase + '-dist');
  fs.cpSync(snapshots.baseline, target, { recursive: true });
  const files = [
    'modules/matches/adapters/persistence/match-projection-writer.js',
    'modules/matches/adapters/persistence/event-recordset.js',
    'core/prisma/recordset-json.js',
  ];
  if (phase === 'stats')
    files.push('modules/stats/adapters/persistence/player-stats-writer.js');
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(path.join(root, 'dist', file), path.join(target, file));
  }
  snapshots[phase] = target;
}
for (let round = 1; round <= 3; round++) {
  const phases =
    round % 2
      ? ['baseline', 'events', 'stats', 'full']
      : ['full', 'stats', 'events', 'baseline'];
  for (const phase of phases) {
    const out = `docs/analysis/write-optimization/${phase}-${round}.json`;
    console.log(new Date().toISOString(), phase, round);
    execFileSync(
      'taskset',
      [
        '-c',
        '0,2',
        'node',
        'scripts/architecture-study/run.cjs',
        '.tmp/architecture-study-corpus',
        out,
        '--variants=A',
        '--workers=2',
        '--count=120',
        '--exclude-rejected=1',
        `--round=${round}`,
      ],
      {
        cwd: root,
        env: { ...process.env, STUDY_DIST: snapshots[phase] },
        stdio: 'inherit',
      },
    );
  }
}
