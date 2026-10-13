/* Controlled generation/definition retirement in an isolated process and cloned DB.
 * Overrides compiled constant exports in memory only; no source/dist file changes.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { client, composition } = require('./engine.cjs');
const { from } = require('./adapters.cjs');
const { RebuildService } = from('modules/processing/services/rebuild.service');
const { DatasetQueryRepository } = from(
  'modules/dataset/adapters/dataset-query.repository',
);
const policy = from('lib/processing-policy');
const compatibility = from('modules/dataset/contracts/processing');
async function main() {
  const [input, output] = process.argv.slice(2),
    sourceReport = JSON.parse(fs.readFileSync(input));
  const result = {
    measuredAt: new Date().toISOString(),
    kind: 'controlled version 4 to 5 and retirement of one definition; no new scientific formula',
    variants: [],
  };
  for (const source of sourceReport.variants.filter((r) =>
    ['A', 'B2', 'C', 'E'].includes(r.variant),
  )) {
    const database = `highbr_architecture_study_version_${source.variant.toLowerCase()}_${Date.now()}`;
    execFileSync('docker', [
      'exec',
      'highbr-architecture-study-pg',
      'psql',
      '-U',
      'integration',
      '-p',
      '55441',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE ${database} TEMPLATE ${source.database}`,
    ]);
    const db = client(database),
      processing = composition(db, source.variant);
    const initialCount = await db.historicalMetricContribution.count(),
      sample = await db.historicalMetricContribution.findFirstOrThrow({
        orderBy: { id: 'asc' },
      });
    const retiredDefinition = sample.definitionId,
      retiredCount = await db.historicalMetricContribution.count({
        where: { definitionId: retiredDefinition },
      });
    const original = processing.datasetWriter;
    processing.datasetWriter = {
      prepare: (input) =>
        original
          .prepare(input)
          .filter((row) => row.definitionId !== retiredDefinition),
      write: (...args) => original.write(...args),
    };
    policy.PROCESSING_VERSION = 5;
    await new RebuildService(db, processing).run();
    assert.equal(
      await db.historicalMetricContribution.count({
        where: { processingVersion: 4 },
      }),
      0,
    );
    assert.equal(
      await db.historicalMetricContribution.count({
        where: { definitionId: retiredDefinition },
      }),
      0,
    );
    assert.equal(
      await db.historicalMetricContribution.count({
        where: { processingVersion: 5 },
      }),
      initialCount - retiredCount,
    );
    assert.equal(
      await db.matchProcessing.count({
        where: { processingVersion: { not: 5 } },
      }),
      0,
    );
    const oldReader = await new DatasetQueryRepository(db).query(
      { eligibleOnly: false },
      5,
    );
    assert.equal(oldReader.rows.length, 0);
    assert.equal(
      oldReader.summary.unmaterializedMatches,
      sourceReport.matches.length,
    );
    compatibility.DATASET_PROCESSING_VERSION = 5;
    const newReader = await new DatasetQueryRepository(db).query(
      { eligibleOnly: false },
      5,
    );
    assert.equal(newReader.summary.counts.rows, initialCount - retiredCount);
    assert.equal(newReader.summary.unmaterializedMatches, 0);
    assert(
      newReader.rows.every(
        (row) =>
          row.processingVersion === 5 && row.definitionId !== retiredDefinition,
      ),
    );
    const record = {
      variant: source.variant,
      database,
      passed: true,
      fromVersion: 4,
      toVersion: 5,
      retiredDefinition,
      retiredRows: retiredCount,
      oldRows: initialCount,
      newRows: initialCount - retiredCount,
      oldReaderHidesNewGeneration: true,
      newReaderPublishesNewGeneration: true,
    };
    result.variants.push(record);
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(record));
    policy.PROCESSING_VERSION = 4;
    compatibility.DATASET_PROCESSING_VERSION = 4;
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
