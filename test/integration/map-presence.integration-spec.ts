import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { MatchMapPresenceService } from '../../src/modules/matches/services/match-map-presence.service';
import { parseMatchData } from '../../src/modules/worker/pure/match.parser';
import {
  mapPresenceFixture,
  mapPresenceSummary,
} from '../fixtures/map-presence';

describe('MET25 projected position PostgreSQL contract', () => {
  let prisma: PrismaService;
  const matchId = `MET25_${process.pid}_positions`,
    input = mapPresenceFixture();
  const puuid = input.participants[0].puuid,
    completedAt = new Date('2026-09-23T01:02:03.456Z');
  beforeAll(async () => {
    const datasourceUrl = process.env.TEST_DATABASE_URL;
    if (
      !datasourceUrl ||
      !new URL(datasourceUrl).pathname.includes('integration')
    )
      throw new Error('Explicit isolated database required');
    prisma = new PrismaService({ datasourceUrl });
    await prisma.$connect();
    const raw = structuredClone(mapPresenceSummary);
    raw.metadata.matchId = matchId;
    const parsed = parseMatchData(raw);
    const first = Object.values(
      input.projection!.frames[0].participantFrames,
    ).find((p) => p.puuid === puuid)!;
    first.position = null;
    await prisma.$transaction(async (tx) => {
      await tx.matchProcessing.create({
        data: {
          matchId,
          status: 'COMPLETED',
          processingVersion: 3,
          completedAt,
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
  it('round-trips missing coordinates, frame cadence and provenance without raw or ward positions', async () => {
    const service = new MatchMapPresenceService(prisma),
      first = await service.getPresence(matchId, puuid);
    expect(first).toMatchObject({
      processedAt: completedAt.toISOString(),
      processingVersion: 3,
      quality: { validSamples: 40, totalSamples: 41 },
      excludedReasons: { missing_position: 1 },
    });
    expect(first.sampling.frames.intervals.at(-1)?.elapsedMs).toBe(28157);
    expect(first.absolute.reduce((n, r) => n + r.sampleCount, 0)).toBe(40);
    expect(await service.getPresence(matchId, puuid)).toEqual(first);
    expect(await prisma.matchRaw.findUnique({ where: { matchId } })).toBeNull();
  });
});
