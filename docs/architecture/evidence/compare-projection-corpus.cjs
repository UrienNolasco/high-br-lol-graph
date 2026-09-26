const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd();
const outputRoot = process.env.ARQ_CORPUS_OUTPUT;
assert.ok(outputRoot, 'Set ARQ_CORPUS_OUTPUT to an isolated output directory');
const baselineRoot = process.env.ARQ_CORPUS_BASELINE;
fs.mkdirSync(outputRoot, {recursive:true});
const originalWrite = fs.writeFileSync.bind(fs);
const comparisons = [];
fs.writeFileSync = (file, data, ...options) => {
  const absolute = path.resolve(file);
  assert.ok(absolute.startsWith(path.join(root, 'docs/analysis/')));
  originalWrite(path.join(outputRoot, path.basename(absolute)), data, ...options);
  const baseline = baselineRoot && path.join(baselineRoot, path.basename(absolute));
  if (baseline) {
    assert.ok(fs.existsSync(baseline), `Missing baseline output ${baseline}`);
    const actual = JSON.parse(String(data));
    const expected = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    // Wall-clock timing is benchmark evidence, not a metric value.
    delete actual.calculationMs; delete expected.calculationMs;
    assert.deepStrictEqual(actual, expected, `Semantic difference in ${file}`);
    comparisons.push(path.basename(absolute));
  }
};
for (const name of ['final-stats','contribution','vision','objectives','sequences','bounties-steals','kill-episodes']) require(path.join(root, 'scripts', `validate-${name}.cjs`));
console.log(JSON.stringify({semanticBaselineComparisons: comparisons}));
