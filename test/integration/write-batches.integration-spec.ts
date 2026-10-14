import { Prisma, PrismaClient } from '@prisma/client';
import { historicalDatasetFixture } from '../fixtures/historical-dataset';
import { jsonObject } from '../../src/core/prisma/json-value';
import {
  writeEvents,
  EVENT_WRITE_BATCH_SIZE,
} from '../../src/modules/matches/adapters/persistence/event-recordset';
import {
  prepareHistoricalDataset,
  publishPreparedDataset,
} from '../../src/modules/dataset/adapters/dataset-writer.adapter';
import { PlayerStatsAggregationService } from '../../src/modules/stats/adapters/persistence/player-stats-writer';
import { toTransactionContext } from '../../src/core/prisma/transaction-context';

let db: PrismaClient;
const matchId = 'WRITE_BATCH_TEST';
const completedAt = new Date('2026-10-13T00:00:00Z');
const fixture = () => {
  const input = historicalDatasetFixture();
  input.match.matchId = matchId;
  input.processedAt = completedAt;
  input.events = input.events.map((event) => ({ ...event, matchId }));
  return input;
};
beforeAll(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_integration'))
    throw new Error('Explicit disposable *_integration database required');
  db = new PrismaClient({ datasourceUrl: url });
});
beforeEach(async () => {
  await db.match.deleteMany({ where: { matchId } });
  const match = fixture().match;
  await db.match.create({
    data: { ...match, finalContext: jsonObject(match.finalContext) },
  });
});
afterAll(async () => {
  await db?.match.deleteMany({ where: { matchId } });
  await db?.championStats.deleteMany({ where: { championId: 999999 } });
  await db?.playerStats.deleteMany({
    where: { puuid: { startsWith: 'WRITE_BATCH_PLAYER_' } },
  });
  await db?.playerChampionStats.deleteMany({ where: { championId: 999999 } });
  await db?.$disconnect();
});

async function events() {
  return db.$queryRaw<
    Array<{ value: string; idsSqlNull: boolean; puuidsSqlNull: boolean }>
  >(Prisma.sql`SELECT row_to_json(e)::text value,
    "assistingParticipantIds" IS NULL AS "idsSqlNull", "assistingPuuids" IS NULL AS "puuidsSqlNull"
    FROM match_event_projections e WHERE "matchId"=${matchId} ORDER BY "frameIndex","eventIndex"`);
}
async function dataset() {
  return db.$queryRaw<
    Array<{ value: string; sqlNull: boolean }>
  >(Prisma.sql`SELECT row_to_json(d)::text value,denominator IS NULL AS "sqlNull"
    FROM historical_metric_contributions d WHERE "matchId"=${matchId} ORDER BY id`);
}
// Parse JSON text to compare the stored numeric values, bypassing Prisma's
// Float decoder, while ignoring JSON object key ordering/number formatting.
const logical = (rows: readonly { value: string }[]) =>
  rows.map((r) => ({ ...r, value: JSON.parse(r.value) as unknown }));

test('event batches match createMany including fractional positions and nested JSON numbers', async () => {
  const input = fixture();
  const values = [
    11.000000000000002,
    20.878599053443008,
    24.056850811767468,
    -1.2345678901234567,
    1e-100,
    1e100,
    1.2345678901234567e100,
    Number.MAX_SAFE_INTEGER + 3,
  ];
  const selected = values.map((value, i) => ({
    ...input.events[0],
    eventIndex: i,
    positionX: value,
    positionY: -value,
    assistingParticipantIds: i % 2 ? [] : null,
    assistingPuuids: i % 2 ? [null, 'observed'] : null,
    payload: {
      value,
      nested: [value, null, { fraction: value }],
      omitted: undefined,
    },
  }));
  await db.matchEventProjection.createMany({
    data: selected.map((event) => ({
      ...event,
      processedAt: completedAt,
      payload: jsonObject(event.payload),
      quality: jsonObject(event.quality),
      assistingParticipantIds: event.assistingParticipantIds ?? Prisma.DbNull,
      assistingPuuids: event.assistingPuuids ?? Prisma.DbNull,
    })),
  });
  const expected = logical(await events());
  await db.matchEventProjection.deleteMany({ where: { matchId } });
  await db.$transaction((tx) => writeEvents(tx, selected, completedAt));
  expect(logical(await events())).toEqual(expected);
});

test('conflict in a later event batch rolls back all preceding batches', async () => {
  const event = fixture().events[0];
  const selected = Array.from(
    { length: EVENT_WRITE_BATCH_SIZE + 1 },
    (_, i) => ({ ...event, eventIndex: i }),
  );
  selected[selected.length - 1].eventIndex = 0;
  await expect(
    db.$transaction((tx) => writeEvents(tx, selected, completedAt), {
      timeout: 30000,
    }),
  ).rejects.toThrow();
  expect(await db.matchEventProjection.count({ where: { matchId } })).toBe(0);
});

test('dataset bulk is identical to createMany, preserves SQL and JSON null, and replaces atomically', async () => {
  const input = fixture();
  const prepared = prepareHistoricalDataset(input);
  prepared[0].denominator = Prisma.JsonNull;
  prepared[1].denominator = Prisma.DbNull;
  prepared[2].quality = Prisma.JsonNull;
  prepared[3].evidence = Prisma.JsonNull;
  for (let offset = 0; offset < prepared.length; offset += 500)
    await db.historicalMetricContribution.createMany({
      data: prepared.slice(offset, offset + 500).map((row) => ({
        ...row,
        processedAt: input.processedAt,
        lineage: input.lineage as unknown as Prisma.InputJsonValue,
      })),
    });
  const expected = logical(await dataset());
  await db.$transaction((tx) => publishPreparedDataset(tx, input, prepared), {
    timeout: 30000,
  });
  expect(logical(await dataset())).toEqual(expected);
  const broken = prepared.slice(0, 501);
  broken[500] = broken[0];
  await expect(
    db.$transaction((tx) => publishPreparedDataset(tx, input, broken), {
      timeout: 30000,
    }),
  ).rejects.toThrow();
  expect(logical(await dataset())).toEqual(expected);
  await expect(
    db.$transaction((tx) =>
      publishPreparedDataset(tx, input, [{ ...prepared[0], matchId: 'WRONG' }]),
    ),
  ).rejects.toThrow('does not belong');
  expect(logical(await dataset())).toEqual(expected);
  await db.$transaction((tx) => publishPreparedDataset(tx, input, []));
  expect(
    await db.historicalMetricContribution.count({ where: { matchId } }),
  ).toBe(0);
});

test('repeated champion keys retain sequential floating point increments and first name', async () => {
  const input = fixture();
  const participants = input.participants.slice(0, 2).map((p, i) => ({
    ...p,
    puuid: `WRITE_BATCH_PLAYER_${i}`,
    championId: 999999,
    championName: `first-${i}`,
    kda: i ? 0.000000000000002 : 11.000000000000002,
  }));
  const processing = {
    matchData: { match: input.match, participants, teams: input.teams },
    timeline: { snapshotProjection: input.projection },
  } as Parameters<PlayerStatsAggregationService['update']>[1];
  const writer = new PlayerStatsAggregationService();
  const deltas = writer
    .prepare(processing)
    .filter((d) => d.table === 'champion_stats');
  await db.championStats.deleteMany({ where: { championId: 999999 } });
  await db.playerStats.deleteMany({
    where: { puuid: { startsWith: 'WRITE_BATCH_PLAYER_' } },
  });
  await db.playerChampionStats.deleteMany({ where: { championId: 999999 } });
  const [expected] = await db.$queryRaw<Array<{ value: string }>>(
    Prisma.sql`SELECT ((${deltas[0].sums.sumKda}::float8)+${deltas[1].sums.sumKda}::float8)::text value`,
  );
  await db.$transaction((tx) =>
    writer.update(toTransactionContext(tx), processing),
  );
  const [actual] = await db.$queryRaw<
    Array<{ value: string; gamesPlayed: number; championName: string }>
  >`
    SELECT "sumKda"::text value,"gamesPlayed","championName" FROM champion_stats WHERE "championId"=999999`;
  expect(actual).toEqual({
    value: expected.value,
    gamesPlayed: 2,
    championName: 'first-0',
  });
});
