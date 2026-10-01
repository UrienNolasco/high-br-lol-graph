import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { createProcessingService } from '../helpers/processing';
import { ReadSnapshot } from '../../src/core/prisma/read-snapshot';
import { DatasetWindowAdapter } from '../../src/modules/dataset/adapters/window-reader';
import { SequenceExamplesAdapter } from '../../src/modules/matches/adapters/persistence/sequence-examples-reader';
import { EvolutionRepository } from '../../src/modules/evolution/adapters/evolution.repository';
import { normalizeEvolutionQuery } from '../../src/modules/evolution/evolution-contract';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite(
  'MET21 SQL and episodes against processed fixture (serial disposable DB)',
  () => {
    let prisma: PrismaService;
    const prefix = `MET21_${process.pid}_`,
      ids = [prefix + 'baseline', prefix + 'recent'];
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
    const player = summary.info.participants.find(
        (p) => p.championName === 'Fiora',
      )!,
      // Controlled synthetic period isolates these copies from suites replaying
      // the same real player at the source match date. This is not a real history.
      date = Date.UTC(2000, 0, 1);
    beforeAll(async () => {
      const datasourceUrl = process.env.TEST_DATABASE_URL!;
      if (!new URL(datasourceUrl).pathname.includes('integration'))
        throw new Error('Disposable integration database required');
      prisma = new PrismaService({ datasourceUrl });
      await prisma.$connect();
      const jobs = createProcessingService(prisma, {
        getMatchById: async (id) => {
          const s = structuredClone(summary);
          s.metadata.matchId = id;
          s.info.gameCreation = date + ids.indexOf(id) * 86400000;
          return s;
        },
        getTimeline: async (id) => {
          const t = structuredClone(timeline);
          t.metadata.matchId = id;
          return t;
        },
      });
      for (const matchId of ids) await jobs.processMatch({ matchId });
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.match.deleteMany({ where: { matchId: { in: ids } } });
        await prisma.matchProcessing.deleteMany({
          where: { matchId: { in: ids } },
        });
        await prisma.$disconnect();
      }
    });
    it('queries exact [) windows, reconciles persisted counts with episodes and stays read-only', async () => {
      const q = normalizeEvolutionQuery(player.puuid, {
        definitionId: 'final.deathsNearObjectives',
        championId: player.championId,
        role: player.teamPosition,
        queueId: summary.info.queueId,
        mapId: summary.info.mapId,
        horizonKey: 'final',
        baselineFromMs: date,
        baselineToMs: date + 86400000,
        recentFromMs: date + 86400000,
        recentToMs: date + 2 * 86400000,
      });
      const snapshot = new ReadSnapshot(prisma);
      const repo = new EvolutionRepository(
          snapshot,
          new DatasetWindowAdapter(snapshot),
          new SequenceExamplesAdapter(snapshot),
        ),
        before = await prisma.historicalMetricContribution.count({
          where: { matchId: { in: ids } },
        });
      const r = await repo.getEvolution(q);
      expect(r.windows.baseline.counts.candidate.matches).toBe(1);
      expect(r.windows.recent.counts.candidate.matches).toBe(1);
      expect(r.windows.baseline.observations.items[0].matchId).toBe(ids[0]);
      expect(r.windows.recent.observations.items[0].matchId).toBe(ids[1]);
      expect(r.comparison.pooledObservedDelta.mean).toBe(0);
      expect(r.comparison.trend).toBeNull();
      const example = r.windows.baseline.examples.items[0];
      expect(example.reason).toBeNull();
      const episodes = example.episodes as Array<{
        eligible: boolean;
        objectives: unknown[];
      }>;
      expect(episodes.filter((e) => e.eligible).length).toBe(
        r.windows.baseline.deathPattern.eligibleDeaths,
      );
      expect(
        episodes.filter((e) => e.eligible && e.objectives.length > 0).length,
      ).toBe(r.windows.baseline.deathPattern.associatedEligibleDeaths);
      expect(
        await prisma.historicalMetricContribution.count({
          where: { matchId: { in: ids } },
        }),
      ).toBe(before);
      const wrong = await repo.getEvolution(
        normalizeEvolutionQuery(player.puuid, {
          ...q.filters,
          playerId: undefined,
          subjectKind: undefined,
          usage: undefined,
          eligibleOnly: undefined,
          championId: 1,
          baselineFromMs: date,
          baselineToMs: date + 86400000,
          recentFromMs: date + 86400000,
          recentToMs: date + 2 * 86400000,
        }),
      );
      expect(wrong.windows.baseline.counts.candidate.matches).toBe(0);
    });
  },
);
