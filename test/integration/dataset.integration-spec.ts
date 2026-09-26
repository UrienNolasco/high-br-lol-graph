import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
import { RebuildService } from '../../src/core/processing/rebuild.service';
import { PlayerStatsAggregationService } from '../../src/core/stats/player-stats-aggregation.service';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { RiotService } from '../../src/core/riot/riot.service';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
import { WorkerService } from '../../src/modules/worker/services/worker.service';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { DatasetService } from '../../src/modules/dataset/dataset.service';
import { normalizeDatasetFilters } from '../../src/core/dataset/dataset-query';
import {
  exportHistoricalDataset,
  stableJson,
} from '../../src/core/dataset/dataset-export';
import * as persistence from '../../src/core/dataset/dataset-persistence';
import { historicalDatasetFixture } from '../fixtures/historical-dataset';

const fixture = historicalDatasetFixture();
const ids = ['MET19_TRAIN', 'MET19_TEST'];
const creation = Number(fixture.match.gameCreation);
let prisma: PrismaService;
let jobs: ProcessingService;
let worker: WorkerService;
let directory: string;
const riot = {
  getMatchById: jest
    .fn()
    .mockRejectedValue(new Error('No Riot in dataset rebuild')),
  getTimeline: jest
    .fn()
    .mockRejectedValue(new Error('No Riot in dataset rebuild')),
};
async function seed(id: string, offset = 0) {
  const summary = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  ) as MatchDto;
  const timeline = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  ) as TimelineDto;
  summary.metadata.matchId = timeline.metadata.matchId = id;
  summary.info.gameCreation += offset;
  await jobs.enqueue(id);
  await prisma.matchRaw.create({
    data: {
      matchId: id,
      summary: gzipSync(JSON.stringify(summary)),
      timeline: gzipSync(JSON.stringify(timeline)),
    },
  });
}
const durable = async () =>
  (
    await prisma.historicalMetricContribution.findMany({
      orderBy: { id: 'asc' },
    })
  ).map(({ processedAt, ...row }) => row);
beforeAll(async () => {
  const datasourceUrl = process.env.TEST_DATABASE_URL;
  if (
    !datasourceUrl ||
    !new URL(datasourceUrl).pathname.endsWith('_integration')
  )
    throw new Error('Explicit isolated integration database required');
  prisma = new PrismaService({ datasourceUrl });
  await prisma.$connect();
  await prisma.$transaction([
    prisma.discoveryObservation.deleteMany(),
    prisma.match.deleteMany(),
    prisma.playerStats.deleteMany(),
    prisma.playerChampionStats.deleteMany(),
    prisma.championStats.deleteMany(),
    prisma.matchProcessing.deleteMany(),
    prisma.processingMaintenance.deleteMany(),
  ]);
  jobs = new ProcessingService(prisma);
  worker = new WorkerService(
    riot as unknown as RiotService,
    new TimelineParserService(),
    new MatchPersistenceService(
      prisma,
      jobs,
      new PlayerStatsAggregationService(),
    ),
    jobs,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
  directory = await mkdtemp(join(tmpdir(), 'met19-dataset-'));
});
afterAll(async () => {
  jest.restoreAllMocks();
  await prisma?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('worker publishes compact rows with exact provenance, distinct cohorts, missing coverage and same identities through two rebuilds', async () => {
  for (const [i, id] of ids.entries()) await seed(id, i * 86400000);
  await jobs.recordDiscovery(ids, {
    observationId: 'MET19_SYNTHETIC_COLLECTOR',
    source: 'collector',
    observedAt: new Date('2026-09-23Z'),
    region: 'BR',
    queriedPuuid: fixture.participants[0].puuid,
    queueFilter: 420,
    requestedCount: 100,
    startIndex: 0,
    rank: {
      tier: 'CHALLENGER',
      division: 'I',
      leaguePoints: 1000,
      queue: 'RANKED_SOLO_5x5',
      observedAt: new Date('2026-09-23Z'),
    },
  });
  await jobs.recordDiscovery(ids, {
    observationId: 'MET19_SYNTHETIC_SYNC',
    source: 'sync',
    observedAt: new Date('2026-09-23Z'),
    region: 'BR',
    queriedPuuid: fixture.participants[0].puuid,
    queueFilter: null,
    requestedCount: 100,
    startIndex: 0,
    rank: null,
  });
  const start = Date.now();
  for (const id of ids) await worker.processMatch({ matchId: id });
  const rows = await prisma.historicalMetricContribution.findMany({
    where: { matchId: ids[0] },
    orderBy: { id: 'asc' },
  });
  expect(rows.length).toBeGreaterThan(500);
  const job = await prisma.matchProcessing.findUniqueOrThrow({
    where: { matchId: ids[0] },
  });
  expect(job.status).toBe('COMPLETED');
  expect(
    rows.every(
      (r) =>
        r.processedAt.getTime() === job.completedAt!.getTime() &&
        r.processingVersion === PROCESSING_VERSION,
    ),
  ).toBe(true);
  expect(
    (
      await prisma.matchEventProjection.findFirstOrThrow({
        where: { matchId: ids[0] },
      })
    ).processedAt,
  ).toEqual(job.completedAt);
  expect(rows[0].lineage).toMatchObject({
    status: 'observed',
    observationIds: ['MET19_SYNTHETIC_COLLECTOR', 'MET19_SYNTHETIC_SYNC'],
  });
  for (const row of rows.filter(
    (r) => r.usage === 'predictive' && r.value !== null,
  ))
    expect(row.sourceMaxTimestampMs).toBeLessThanOrEqual(row.horizonMs!);
  const filters = normalizeDatasetFilters({
    patch: '16.2',
    queueId: 420,
    mapId: 11,
    definitionId: 'snapshot.totalGold',
    subjectKind: 'participant',
    horizonKey: 't:900000',
  });
  const service = new DatasetService(prisma);
  const result = await service.query(filters, 5);
  expect(result.summary.counts).toEqual({
    rows: 20,
    matches: 2,
    players: 10,
    validRows: 20,
  });
  expect(result.rows).toHaveLength(5);
  const page2 = await service.query(filters, 5, result.nextAfter!);
  expect(page2.rows.some((r) => result.rows.some((p) => p.id === r.id))).toBe(
    false,
  );
  const narrowed = await service.query(
    normalizeDatasetFilters({
      ...filters,
      championId: fixture.participants[0].championId,
      role: fixture.participants[0].role,
      fromMs: creation,
      toMs: creation + 1,
    }),
    20,
  );
  expect(narrowed.summary.counts).toMatchObject({
    matches: 1,
    players: 1,
    rows: 1,
  });
  await prisma.match.create({
    data: { ...fixture.match, matchId: 'MET19_NO_DATASET' },
  });
  expect((await service.query(filters)).summary.unmaterializedMatches).toBe(1);
  await prisma.match.delete({ where: { matchId: 'MET19_NO_DATASET' } });
  const expected = await durable();
  const rebuild = new RebuildService(prisma, worker);
  expect(await rebuild.run()).toBe(2);
  expect(await durable()).toEqual(expected);
  expect(await rebuild.run()).toBe(2);
  expect(await durable()).toEqual(expected);
  expect(riot.getMatchById).not.toHaveBeenCalled();
  expect(riot.getTimeline).not.toHaveBeenCalled();
  const benchmark = {
    fixture:
      'BR1_3200579475; synthetic match IDs/discovery and +1day creation only',
    datasetVersion: 1,
    processingVersion: PROCESSING_VERSION,
    rowsPerMatch: rows.length,
    jsonBytesPerMatch: Buffer.byteLength(stableJson(rows)),
    ingestTwoMatchesMs: Date.now() - start,
    distinctPlayers: 10,
    distinctMatches: 2,
    note: 'Local integration includes two rebuilds in elapsed duration; not a production throughput estimate.',
  };
  if (process.env.MET19_BENCHMARK_PATH)
    await writeFile(
      process.env.MET19_BENCHMARK_PATH,
      JSON.stringify(benchmark, null, 2) + '\n',
    );
});

test('replacement removes retired definitions, preserves replay count and rolls back a failed publication atomically', async () => {
  const input = historicalDatasetFixture();
  input.match.matchId = ids[0];
  input.events = input.events.map((e) => ({ ...e, matchId: ids[0] }));
  const first = await prisma.historicalMetricContribution.findFirstOrThrow({
    where: { matchId: ids[0] },
  });
  await prisma.historicalMetricContribution.create({
    data: {
      ...first,
      quality: first.quality as Prisma.InputJsonValue,
      evidence: first.evidence as Prisma.InputJsonValue,
      lineage: first.lineage as Prisma.InputJsonValue,
      denominator:
        first.denominator === null
          ? Prisma.DbNull
          : (first.denominator as Prisma.InputJsonValue),
      id: 'retired-definition',
      definitionId: 'retired.definition',
    },
  });
  await prisma.$transaction(
    (tx) => persistence.replaceHistoricalDataset(tx, input),
    { timeout: 30000 },
  );
  expect(
    await prisma.historicalMetricContribution.findUnique({
      where: { id: 'retired-definition' },
    }),
  ).toBeNull();
  const expected = await durable();
  await expect(
    prisma.$transaction(
      async (tx) => {
        await persistence.replaceHistoricalDataset(tx, input);
        throw new Error('injected after dataset replacement');
      },
      { timeout: 30000 },
    ),
  ).rejects.toThrow('injected after');
  expect(await durable()).toEqual(expected);
  await expect(
    prisma.historicalMetricContribution.update({
      where: { id: first.id },
      data: {
        sourceMaxTimestampMs: 999999999,
        usage: 'predictive',
        horizonMs: 300000,
      },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.historicalMetricContribution.update({
      where: { id: first.id },
      data: {
        value: Infinity,
        sumValue: Infinity,
        validCount: 1,
        reason: null,
      },
    }),
  ).rejects.toThrow();
  await seed('MET19_ROLLBACK');
  const original = persistence.replaceHistoricalDataset;
  const fail = jest
    .spyOn(persistence, 'replaceHistoricalDataset')
    .mockImplementationOnce(async (tx, data, prepared) => {
      await original(tx, data, prepared);
      throw new Error('injected after materialization');
    });
  await worker.processMatch({ matchId: 'MET19_ROLLBACK' });
  expect(
    await prisma.matchProcessing.findUnique({
      where: { matchId: 'MET19_ROLLBACK' },
    }),
  ).toMatchObject({
    status: 'RETRY_WAIT',
    lastError: expect.stringContaining('injected after materialization'),
  });
  const retained = await prisma.matchRaw.findUniqueOrThrow({
    where: { matchId: 'MET19_ROLLBACK' },
  });
  expect(retained.summary).not.toBeNull();
  expect(retained.timeline).not.toBeNull();
  fail.mockRestore();
  expect(
    await prisma.match.count({ where: { matchId: 'MET19_ROLLBACK' } }),
  ).toBe(0);
  expect(
    await prisma.historicalMetricContribution.count({
      where: { matchId: 'MET19_ROLLBACK' },
    }),
  ).toBe(0);
  await prisma.matchProcessing.delete({ where: { matchId: 'MET19_ROLLBACK' } });
});

test('two exports are byte-identical, split whole matches, retain real lineage and distinguish exclusions from metric missingness', async () => {
  const sample = await prisma.historicalMetricContribution.findFirstOrThrow({
    where: { matchId: ids[1], usage: 'predictive' },
  });
  await prisma.historicalMetricContribution.update({
    where: { id: sample.id },
    data: { eligible: false, exclusionReason: 'synthetic_quality_exclusion' },
  });
  const absent = await prisma.historicalMetricContribution.findFirstOrThrow({
    where: { matchId: ids[1], usage: 'predictive', id: { not: sample.id } },
  });
  await prisma.historicalMetricContribution.update({
    where: { id: absent.id },
    data: {
      value: null,
      sumValue: 0,
      validCount: 0,
      reason: 'synthetic_missing_field',
    },
  });
  const options = {
    filters: normalizeDatasetFilters(),
    split: { trainBeforeMs: creation + 1, validationBeforeMs: creation + 2 },
  };
  const first = await exportHistoricalDataset(prisma, {
    ...options,
    out: join(directory, 'first'),
  });
  const second = await exportHistoricalDataset(prisma, {
    ...options,
    out: join(directory, 'second'),
  });
  expect(first.manifestSha256).toBe(second.manifestSha256);
  for (const file of await readdir(join(directory, 'first')))
    expect(await readFile(join(directory, 'first', file), 'utf8')).toBe(
      await readFile(join(directory, 'second', file), 'utf8'),
    );
  expect(first.splitMatches).toEqual({ train: 1, validation: 0, test: 1 });
  expect(first.summary.exclusions).toContainEqual({
    reason: 'synthetic_quality_exclusion',
    rows: 1,
    matches: 1,
  });
  expect(first.summary.missingness).toContainEqual({
    reason: 'synthetic_missing_field',
    rows: 1,
    matches: 1,
  });
  expect(first.lineage).toMatchObject({ observations: 2, unknownRows: 0 });
  for (const filename of [
    'features.jsonl',
    'labels.jsonl',
    'descriptive.jsonl',
  ]) {
    const rows = (await readFile(join(directory, 'first', filename), 'utf8'))
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            matchId: string;
            split: string;
            definitionId: string;
          },
      );
    expect(
      rows
        .filter((r) => r.matchId === ids[0])
        .every((r) => r.split === 'train'),
    ).toBe(true);
    expect(
      rows.filter((r) => r.matchId === ids[1]).every((r) => r.split === 'test'),
    ).toBe(true);
    if (filename === 'features.jsonl')
      expect(
        rows.every(
          (r) =>
            !r.definitionId.startsWith('final.') &&
            !r.definitionId.startsWith('label.'),
        ),
      ).toBe(true);
  }
  await expect(
    exportHistoricalDataset(prisma, {
      ...options,
      out: join(directory, 'too-big'),
      maxRows: 1,
    }),
  ).rejects.toThrow('exceeds explicit bound');
  await expect(
    exportHistoricalDataset(prisma, {
      ...options,
      out: join(directory, 'first'),
    }),
  ).rejects.toThrow('already exists');
  await prisma.match.delete({ where: { matchId: ids[0] } });
  expect(
    await prisma.historicalMetricContribution.count({
      where: { matchId: ids[0] },
    }),
  ).toBe(0);
});
