import { PrismaService } from '../../../core/prisma/prisma.service';
import { CoverageMatch, discoveryCoverage } from '../contracts/coverage';

/** Offline read model. It does not load raw payloads or current User.rank. */
export class DiscoveryReportService {
  constructor(private readonly prisma: PrismaService) {}

  async coverage() {
    return this.prisma.$transaction(
      async (tx) => {
        const matches = await tx.$queryRaw<CoverageMatch[]>`
        WITH ids AS (
          SELECT "matchId" FROM match_processing
          UNION SELECT "matchId" FROM matches
          UNION SELECT "matchId" FROM match_discoveries
        )
        SELECT ids."matchId", (m."matchId" IS NOT NULL) AS imported,
          (r.summary IS NOT NULL) AS "summaryPresent",
          (r.timeline IS NOT NULL) AS "timelinePresent",
          m."gameCreation", m."queueId", m."mapId", m."gameVersion"
        FROM ids LEFT JOIN matches m ON m."matchId" = ids."matchId"
        LEFT JOIN match_raw r ON r."matchId" = ids."matchId"
        ORDER BY ids."matchId"`;
        const observations = await tx.discoveryObservation.findMany({
          include: { matches: { select: { matchId: true } } },
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
        });
        const [participants] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT puuid) AS n FROM match_participants`;
        return discoveryCoverage(matches, observations, Number(participants.n));
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async lineage(matchId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const observations = await tx.discoveryObservation.findMany({
          where: { matches: { some: { matchId } } },
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
        });
        const match = await tx.match.findUnique({
          where: { matchId },
          select: { matchId: true },
        });
        const job = await tx.matchProcessing.findUnique({
          where: { matchId },
          select: { matchId: true },
        });
        return {
          matchId,
          exists: !!match || !!job || observations.length > 0,
          source: observations.length ? 'observed' : 'unknown',
          reason: observations.length ? null : 'missing_discovery_observation',
          observations,
          rankInterpretation:
            'Queried account at observation time; historical participant rank unavailable.',
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
