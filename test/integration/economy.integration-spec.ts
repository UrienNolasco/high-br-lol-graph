import { PrismaService } from '../../src/core/prisma/prisma.service';
import { MatchEconomyService } from '../../src/modules/matches/services/match-economy.service';
import { parseMatchData } from '../../src/modules/worker/pure/match.parser';
import { economyFixture, economySummary } from '../fixtures/economy.fixture';
import { Prisma } from '@prisma/client';

describe('MET12 persisted economy read contract', () => {
  let prisma: PrismaService;
  const matchId = `MET12_${process.pid}_roundtrip`;
  const input = economyFixture();
  const timestamp = new Date('2026-09-23T01:02:03.456Z');
  beforeAll(async () => {
    const datasourceUrl = process.env.TEST_DATABASE_URL;
    if (
      !datasourceUrl ||
      !new URL(datasourceUrl).pathname.includes('integration')
    )
      throw new Error('Explicit isolated database required');
    prisma = new PrismaService({ datasourceUrl });
    await prisma.$connect();
    const raw = structuredClone(economySummary);
    raw.metadata.matchId = matchId;
    const parsed = parseMatchData(raw);
    await prisma.$transaction(async (tx) => {
      await tx.matchProcessing.create({
        data: {
          matchId,
          status: 'COMPLETED',
          completedAt: timestamp,
          processingVersion: 2,
        },
      });
      await tx.match.create({ data: parsed.match });
      await tx.matchParticipant.createMany({
        data: parsed.participants.map((p) => ({
          ...p,
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
        })),
      });
      await tx.matchTimelineProjection.create({
        data: {
          matchId,
          ...input.projection!,
          frames: input.projection!.frames as unknown as Prisma.InputJsonValue,
        },
      });
    });
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.match.deleteMany({ where: { matchId } });
      await prisma.matchProcessing.deleteMany({ where: { matchId } });
      await prisma.$disconnect();
    }
  });
  it('round-trips timestamp precision, independent final interval and repeatable provenance with no raw row', async () => {
    const service = new MatchEconomyService(prisma);
    const puuid = input.participants[0].puuid;
    const first = await service.getEconomy(matchId, puuid);
    expect(first).toMatchObject({
      eligible: true,
      processedAt: timestamp.toISOString(),
      processingVersion: 2,
    });
    expect(first.samples.slice(-2).map((s) => s.timestampMs)).toEqual([
      2340765, 2368922,
    ]);
    expect(first.intervals.at(-1)).toMatchObject({
      elapsedMs: 28157,
      partialFinalInterval: true,
    });
    expect(await service.getEconomy(matchId, puuid)).toEqual(first);
    expect(await prisma.matchRaw.findUnique({ where: { matchId } })).toBeNull();
    await prisma.matchProcessing.update({
      where: { matchId },
      data: { completedAt: null },
    });
    expect(await service.getEconomy(matchId, puuid)).toMatchObject({
      reason: 'missing_processing_provenance',
      processedAt: null,
      samples: [],
    });
  });
});
