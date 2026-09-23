import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessingService } from '../../src/core/processing/processing.service';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
import { MatchPersistenceService } from '../../src/modules/worker/services/match-persistence.service';
import { parseMatchData } from '../../src/modules/worker/pure/match.parser';
import { TimelineParserService } from '../../src/core/riot/timeline-parser.service';
import { readSnapshotProjection } from '../../src/core/riot/timeline-snapshots';
import { MatchRepository } from '../../src/modules/matches/repositories/match.repository';
import { MatchGoldTimelineService } from '../../src/modules/matches/services/match-gold-timeline.service';

describe('MET03 snapshot transactional round-trip', () => {
  let prisma: PrismaService;
  let processing: ProcessingService;
  let persistence: MatchPersistenceService;
  const aggregates = { update: jest.fn() };
  const prefix = `MET03_${process.pid}_`;
  const fixture = (suffix: string) => {
    const summary = JSON.parse(
      readFileSync(
        join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
        'utf8',
      ),
    );
    const timeline = JSON.parse(
      readFileSync(
        join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
        'utf8',
      ),
    );
    summary.metadata.matchId = timeline.metadata.matchId = prefix + suffix;
    timeline.info.frames[15].participantFrames['1'].championStats.futureStat =
      123.4567890123;
    delete timeline.info.frames[39].participantFrames['1'].currentGold;
    const participants = new Map<number, string>(
      timeline.info.participants.map((p) => [p.participantId, p.puuid]),
    );
    return {
      summary,
      timeline,
      parsed: new TimelineParserService().parseTimeline(timeline, participants),
    };
  };
  beforeAll(async () => {
    const datasourceUrl = process.env.TEST_DATABASE_URL;
    if (
      !datasourceUrl ||
      !new URL(datasourceUrl).pathname.includes('integration')
    )
      throw new Error('Explicit isolated integration database required');
    prisma = new PrismaService({ datasourceUrl });
    await prisma.$connect();
    processing = new ProcessingService(prisma);
    persistence = new MatchPersistenceService(
      prisma,
      processing,
      aggregates as any,
    );
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.match.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.matchProcessing.deleteMany({
        where: { matchId: { startsWith: prefix } },
      });
      await prisma.$disconnect();
    }
  });
  it('persists all identities, order, nulls and precision in the same completion transaction', async () => {
    const { summary, timeline, parsed } = fixture('roundtrip');
    const id = summary.metadata.matchId;
    await processing.enqueue(id);
    const lease = await processing.claim(id);
    expect(lease).not.toBeNull();
    const start = performance.now();
    await persistence.save(lease!, parseMatchData(summary), parsed, timeline);
    const writeMs = performance.now() - start;
    const loaded = await prisma.matchTimelineProjection.findUniqueOrThrow({
      where: { matchId: id },
    });
    const projection = readSnapshotProjection(loaded)!;
    expect(projection.frames).toEqual(parsed.snapshotProjection.frames);
    expect(projection.frames).toHaveLength(41);
    expect(
      projection.frames.flatMap((f) => Object.values(f.participantFrames)),
    ).toHaveLength(410);
    expect(projection.frames[39].participantFrames['1'].currentGold).toBeNull();
    expect(
      projection.frames[15].participantFrames['1'].championStats?.futureStat,
    ).toBe(123.4567890123);
    expect(
      await prisma.matchProcessing.findUnique({ where: { matchId: id } }),
    ).toMatchObject({
      status: 'COMPLETED',
      processingVersion: PROCESSING_VERSION,
    });
    expect(await processing.claim(id)).toBeNull();
    const response = await new MatchGoldTimelineService(
      new MatchRepository(prisma),
    ).getGoldTimeline(id);
    expect(response.goldDifference).toHaveLength(41);
    expect(response.goldDifference.slice(-2).map((p) => p.timestampMs)).toEqual(
      [2340765, 2368922],
    );
    const [size] = await prisma.$queryRaw<
      Array<{ bytes: number }>
    >`SELECT pg_column_size(frames)::int AS bytes FROM match_timeline_projections WHERE "matchId" = ${id}`;
    const reads: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = performance.now();
      await prisma.matchTimelineProjection.findUniqueOrThrow({
        where: { matchId: id },
      });
      reads.push(performance.now() - before);
    }
    const measured = {
      scope:
        'isolated local DB, one synthetic fixture with 410 snapshots; 10 warm reads',
      snapshotN: 410,
      frameN: 41,
      jsonBytes: Buffer.byteLength(JSON.stringify(parsed.snapshotProjection)),
      postgresFramesBytes: size.bytes,
      writeTransactionMs: writeMs,
      readMs: reads,
    };
    if (process.env.MET03_BENCHMARK_PATH)
      writeFileSync(
        process.env.MET03_BENCHMARK_PATH,
        JSON.stringify(measured, null, 2) + '\n',
      );
  });
  it('rolls snapshots and match back when a later aggregate step fails', async () => {
    const { summary, timeline, parsed } = fixture('rollback');
    const id = summary.metadata.matchId;
    await processing.enqueue(id);
    const lease = await processing.claim(id);
    aggregates.update.mockRejectedValueOnce(
      new Error('synthetic failure after snapshot insert'),
    );
    await expect(
      persistence.save(lease!, parseMatchData(summary), parsed, timeline),
    ).rejects.toThrow('synthetic failure');
    expect(
      await prisma.match.findUnique({ where: { matchId: id } }),
    ).toBeNull();
    expect(
      await prisma.matchTimelineProjection.findUnique({
        where: { matchId: id },
      }),
    ).toBeNull();
    expect(
      await prisma.matchProcessing.findUnique({ where: { matchId: id } }),
    ).toMatchObject({ status: 'PROCESSING', processingVersion: null });
  });
});
