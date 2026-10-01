import { ReadSnapshot } from '../../src/core/prisma/read-snapshot';
import { PlayerOutcomePersistenceReader } from '../../src/modules/dataset/adapters/player-outcome-reader';
import { PlayerHistoryCoveragePersistenceReader } from '../../src/modules/matches/repositories/player-history-coverage.reader';
import { DiscoveryPersistenceReader } from '../../src/modules/collector/adapters/discovery-reader';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PoolSessionsRepository } from '../../src/modules/players/repositories/pool-sessions.repository';
import { normalizePoolSessionQuery } from '../../src/modules/players/contracts/pool-sessions';
import { prepareHistoricalDataset } from '../../src/modules/dataset/adapters/dataset-writer.adapter';
import { historicalDatasetFixture } from '../fixtures/historical-dataset';
import { prismaJson } from '../helpers/prisma-json';
import type { ObservationRequest } from '../../src/modules/processing/contracts/request-ingestion';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('MET31 database anchor, import gaps and scope', () => {
  const prefix = `MET31_${process.pid}_`;
  const playerId = prefix + 'player';
  const start = Date.UTC(2041, 0, 1) + process.pid * 10000;
  let prisma: PrismaService;
  let repository: PoolSessionsRepository;
  const query = normalizePoolSessionQuery(playerId, {
    queueId: 420,
    mapId: 11,
    fromMs: start,
    toMs: start + 86400000,
  });
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.endsWith('_integration'))
      throw new Error('Explicit disposable integration database required');
    prisma = new PrismaService({ datasourceUrl: url });
    await prisma.$connect();
    const snapshot = new ReadSnapshot(prisma);
    repository = new PoolSessionsRepository(
      snapshot,
      new PlayerOutcomePersistenceReader(snapshot),
      new PlayerHistoryCoveragePersistenceReader(snapshot),
      new DiscoveryPersistenceReader(snapshot),
    );
    const fixture = historicalDatasetFixture();
    const participant = fixture.participants[0];
    const anchor = prepareHistoricalDataset(fixture).find(
      (r) =>
        r.subjectId === participant.puuid && r.definitionId === 'label.win',
    )!;
    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < 5; i++) {
          const matchId = prefix + i;
          await tx.match.create({
            data: {
              ...fixture.match,
              matchId,
              gameCreation: BigInt(start + i * 3000000),
              gameDuration: 1200,
              queueId: i === 4 ? 440 : 420,
              finalContext: prismaJson(fixture.match.finalContext),
            },
          });
          await tx.matchParticipant.create({
            data: {
              ...participant,
              matchId,
              puuid: playerId,
              finalInventory: prismaJson(participant.finalInventory),
              runes: prismaJson(participant.runes),
              finalStats: prismaJson(participant.finalStats),
              challenges: prismaJson(participant.challenges),
              pings: prismaJson(participant.pings),
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
            },
          });
          if (i !== 3)
            await tx.historicalMetricContribution.create({
              data: {
                ...anchor,
                lineage: prismaJson(fixture.lineage),
                id: prefix + 'anchor' + i,
                matchId,
                subjectId: playerId,
                playerIds: [playerId],
                gameCreation: BigInt(start + i * 3000000),
                queueId: i === 4 ? 440 : 420,
                championId: i === 0 ? 1 : 2,
                eligible: i !== 2,
                exclusionReason: i === 2 ? 'unknown_remake' : null,
                validCount: 1,
                value: i % 2,
                sumValue: i % 2,
                processedAt: fixture.processedAt,
              },
            });
        }
        await tx.discoveryObservation.create({
          data: {
            id: prefix + 'discovery',
            source: 'sync' satisfies ObservationRequest['source'],
            observedAt: new Date(start + 100),
            queriedPuuid: playerId,
            requestedCount: 1,
            startIndex: 0,
            matches: { create: { matchId: prefix + 'missing' } },
          },
        });
      },
      { timeout: 30000 },
    );
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.discoveryObservation.deleteMany({
        where: { id: { startsWith: prefix } },
      });
      await prisma.match.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.$disconnect();
    }
  });
  it('deduplicates final player anchors, retains excluded chronology and reports distinct gaps', async () => {
    const result = await repository.analyze(query);
    expect(result.coverage).toMatchObject({
      observedDistinctMatches: 3,
      eligiblePoolMatches: 2,
      excludedN: 1,
      unmaterializedMatches: 1,
      status: 'incomplete_import',
    });
    expect(result.discoveryGaps).toMatchObject({
      discoveredUnimportedMatches: 1,
      status: 'incomplete_import',
    });
    expect(result.pool.champions.map((c) => c.championId)).toEqual([1, 2]);
    expect(result.sessions.count).toBe(1);
    expect(result.sessions.sessions[0].matches[2]).toMatchObject({
      matchId: prefix + '2',
      position: 3,
      eligible: false,
      win: null,
    });
    expect(result.pool.contexts.flatMap((c) => c.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetContributionId: prefix + 'anchor0' }),
      ]),
    );
  });
  it('applies half-open period without leaking the next match', async () => {
    const result = await repository.analyze({
      ...query,
      toMs: start + 3000000,
    });
    expect(result.coverage.observedDistinctMatches).toBe(1);
    expect(result.pool.top3).toMatchObject({
      numerator: 1,
      denominator: 1,
      value: 1,
    });
  });
});
