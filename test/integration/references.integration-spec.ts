import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { prepareHistoricalDataset } from '../../src/modules/dataset/adapters/dataset-writer.adapter';
import { ReferenceService } from '../../src/modules/references/reference.service';
import { ReferenceRepository } from '../../src/modules/references/adapters/reference.repository';
import { normalizeReferenceQuery } from '../../src/modules/references/reference-contract';
import { historicalDatasetFixture } from '../fixtures/historical-dataset';
const fixture = historicalDatasetFixture();
const prefix = `MET20_${process.pid}_`;
// Controlled future epoch isolates the API cohort from other task fixtures; not population evidence.
const creation = Date.UTC(2040, 0, 1) + process.pid * 1000;
const anchorSubject = fixture.participants[0];
const id = (i: number) => `${prefix}${i}`;
const identity = (i: number) =>
  createHash('sha256').update(id(i)).digest('hex');
let prisma: PrismaService;
let service: ReferenceService;
const base = {
  patch: '16.2',
  queueId: 420,
  mapId: 11,
  championId: anchorSubject.championId,
  role: anchorSubject.role,
  definitionId: 'final.visionScore',
  horizonKey: 'final',
  fromMs: creation,
  toMs: creation + 1000,
};
beforeAll(async () => {
  const datasourceUrl = process.env.TEST_DATABASE_URL;
  if (
    !datasourceUrl ||
    !new URL(datasourceUrl).pathname.endsWith('_integration')
  )
    throw new Error('Explicit isolated integration database required');
  prisma = new PrismaService({ datasourceUrl });
  await prisma.$connect();
  service = new ReferenceService(new ReferenceRepository(prisma));
  expect(
    await prisma.match.count({
      where: {
        gameCreation: { gte: BigInt(creation), lt: BigInt(creation + 1000) },
      },
    }),
  ).toBe(0);
  const template = prepareHistoricalDataset(fixture).find(
    (r) =>
      r.definitionId === 'final.visionScore' &&
      r.subjectId === anchorSubject.puuid,
  )!;
  await prisma.$transaction(
    async (tx) => {
      await tx.match.createMany({
        data: Array.from({ length: 85 }, (_, i) => ({
          ...fixture.match,
          matchId: id(i),
          gameCreation: BigInt(creation + i),
          gameVersion: i === 84 ? '16.20.1' : fixture.match.gameVersion,
        })),
      });
      await tx.matchParticipant.createMany({
        data: Array.from({ length: 85 }, (_, i) =>
          fixture.participants.map((p, j) => ({
            ...p,
            matchId: id(i),
            puuid: `${id(i)}:${j}`,
            goldGraph: [],
            xpGraph: [],
            csGraph: [],
            damageGraph: [],
            deathPositions: [],
            killPositions: [],
            wardPositions: [],
            pathingSample: [],
            skillOrder: [],
            itemTimeline: [],
            finalStats: {
              projectionVersion: 1,
              values: {
                visionScore: i,
                visionWardsBoughtInGame: i % 4,
                detectorWardsPlaced: i % 3,
              },
              missingReasons: {},
            },
          })),
        ).flat(),
      });
      await tx.historicalMetricContribution.createMany({
        data: Array.from({ length: 85 }, (_, i) => ({
          ...template,
          id: identity(i),
          matchId: id(i),
          subjectId: `${id(i)}:0`,
          playerIds: [`${id(i)}:0`],
          gameCreation: BigInt(creation + i),
          value: i,
          sumValue: i,
          validCount: 1,
          eligible: true,
          exclusionReason: null,
          reason: null,
          patch: i === 84 ? '16.20' : '16.2',
          role: i === 83 ? 'UNKNOWN' : anchorSubject.role,
          processedAt: fixture.processedAt,
          lineage: {
            status: 'unknown',
            reason: 'controlled_synthetic_independent_rosters',
          },
        })),
      });
    },
    { timeout: 30000 },
  );
});
afterAll(async () => {
  if (prisma) {
    await prisma.match.deleteMany({
      where: { matchId: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  }
});
it('round-trips homogeneous distinct sample, target exclusion, period, quantiles and stable provenance without raw access', async () => {
  const query = normalizeReferenceQuery({ ...base, individualId: identity(0) });
  const result = await service.getReference(query);
  expect(result).toMatchObject({
    status: 'available',
    counts: {
      candidateRows: 83,
      eligibleMatches: 83,
      eligiblePlayers: 83,
      selectedMatches: 82,
      selectedRosterPlayers: 820,
    },
    median: 41,
    individual: { value: 0, percentile: { value: 0 } },
    coverage: { value: 1 },
    provenance: { processedAt: { latest: fixture.processedAt.toISOString() } },
  });
  expect(result.quantiles![0].interval).toMatchObject({
    lower: null,
    lowerUnbounded: true,
  });
  expect(await service.getReference(query)).toEqual(result);
  expect(
    await prisma.matchRaw.count({ where: { matchId: { startsWith: prefix } } }),
  ).toBe(0);
  expect(
    (
      await service.getReference(
        normalizeReferenceQuery({ ...base, toMs: creation + 1 }),
      )
    ).counts.candidateRows,
  ).toBe(1);
  await expect(
    service.getReference(
      normalizeReferenceQuery({ ...base, individualId: identity(84) }),
    ),
  ).rejects.toThrow('homogeneous cohort');
});
it('accounts for reused teammates and reports missing coverage without inventing a percentile', async () => {
  await prisma.matchParticipant.update({
    where: { matchId_puuid: { matchId: id(82), puuid: `${id(82)}:9` } },
    data: { puuid: `${id(1)}:9` },
  });
  await prisma.historicalMetricContribution.update({
    where: { id: identity(81) },
    data: {
      value: null,
      sumValue: 0,
      validCount: 0,
      reason: 'synthetic_missing_field',
    },
  });
  const result = await service.getReference(
    normalizeReferenceQuery({ ...base, individualId: identity(0) }),
  );
  expect(result).toMatchObject({
    status: 'insufficient',
    median: null,
    individual: { value: 0, percentile: null },
    counts: { candidateRows: 83, validEligibleRows: 82, selectedMatches: 80 },
    selection: {
      exclusions: { overlapping_player: 2, synthetic_missing_field: 1 },
    },
    coverage: { missingReasons: { synthetic_missing_field: 1 } },
  });
});
it('reads independent V08 counters despite absent anchor metric, preserves unsupported cost with versioned catalog', async () => {
  const query = normalizeReferenceQuery({
    ...base,
    definitionId: 'vision.controlWardsBought',
    individualId: identity(81),
  });
  const counts = await service.getReference(query);
  expect(counts.individual).toMatchObject({
    value: 1,
    reason: null,
    source: { datasetAnchorId: identity(81), finalStatsProjectionVersion: 1 },
  });
  const cost = await service.getReference(
    normalizeReferenceQuery({
      ...base,
      definitionId: 'vision.controlWardGoldSpent',
      individualId: identity(81),
    }),
  );
  expect(cost).toMatchObject({
    status: 'insufficient',
    coverage: { value: 0 },
    individual: {
      value: null,
      reason: 'missing_validated_purchase_context',
      percentile: null,
    },
    visionInvestmentPolicy: {
      catalog: { catalogVersion: '16.2.1', listPriceGold: 75 },
    },
  });
  await prisma.matchParticipant.update({
    where: { matchId_puuid: { matchId: id(81), puuid: `${id(81)}:0` } },
    data: { finalStats: Prisma.DbNull },
  });
  expect((await service.getReference(query)).individual).toMatchObject({
    value: null,
    source: { finalStatsProjectionVersion: null },
  });
});
