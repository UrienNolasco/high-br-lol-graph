import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface ChampionPopulationRow {
  championId: number;
  championName: string | null;
  patch: string;
  queueId: number;
  gamesPlayed: number;
  performanceN: number;
  wins: number | null;
  losses: number | null;
  winRate: number | null;
  kda: number | null;
  dpm: number | null;
  cspm: number | null;
  gpm: number | null;
  pickRate: number | null;
  banRate: number | null;
  pickedMatches: number;
  bannedMatches: number;
  eligibleN: number;
  selectedN: number;
  bansObservedN: number;
  excludedN: number;
  excludedReasons: Record<string, number>;
}
export interface ChampionPopulation {
  champions: ChampionPopulationRow[];
  cohort: {
    patch: string;
    queueId: number;
    mapId: number;
    eligibleN: number;
    selectedN: number;
    excludedN: number;
    bansObservedN: number;
    excludedReasons: Record<string, number>;
  };
}

@Injectable()
export class ChampionStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** SQL aggregates projections; no raw decompression, incremental rate cache or client-side history scan. */
  async findPopulation(
    patch: string,
    queueId = 420,
  ): Promise<ChampionPopulation> {
    if (!/^\d+\.\d+$/.test(patch) || ![420, 440].includes(queueId))
      throw new RangeError('Unsupported patch/queue filter');
    const rows = await this.prisma.$queryRaw<
      Array<
        Omit<ChampionPopulationRow, 'championId'> & {
          championId: number | null;
        }
      >
    >(Prisma.sql`
      WITH selected AS (
        SELECT * FROM matches WHERE "queueId" = ${queueId} AND "mapId" = 11
        AND ("gameVersion" = ${patch} OR "gameVersion" LIKE ${patch + '.%'})
      ), eligible AS (SELECT * FROM selected WHERE "populationEligible" IS TRUE),
      exclusions AS (
        SELECT COALESCE("populationExclusionReason", 'missing_eligibility_projection') AS reason, count(*)::int AS n
        FROM selected WHERE "populationEligible" IS DISTINCT FROM TRUE GROUP BY 1
      ), coverage AS (
        SELECT e."matchId", count(t."teamId") = 2 AND bool_and(t."bansAvailable" IS TRUE) AS complete
        FROM eligible e LEFT JOIN match_teams t ON t."matchId" = e."matchId" GROUP BY e."matchId"
      ), population AS (
        SELECT (SELECT count(*)::int FROM eligible) AS "eligibleN",
          (SELECT count(*)::int FROM selected) AS "selectedN",
          (SELECT count(*)::int FROM coverage WHERE complete) AS "bansObservedN",
          (SELECT count(*)::int FROM selected WHERE "populationEligible" IS DISTINCT FROM TRUE) AS "excludedN",
          COALESCE((SELECT jsonb_object_agg(reason,n) FROM exclusions), '{}'::jsonb) AS "excludedReasons"
      ), picks AS (
        SELECT p."matchId", p."championId", max(p."championName") AS "championName", count(*) AS n,
          bool_and(p.win) AS win, avg(p.kda) AS kda,
          avg(p."totalDamage" / NULLIF(e."gameDuration" / 60.0, 0)) AS dpm,
          avg(p."goldEarned" / NULLIF(e."gameDuration" / 60.0, 0)) AS gpm,
          avg(p."totalCs" / NULLIF(e."gameDuration" / 60.0, 0)) AS cspm
        FROM match_participants p JOIN eligible e ON e."matchId" = p."matchId"
        GROUP BY p."matchId", p."championId"
      ), performance AS (
        SELECT "championId", max("championName") AS "championName", count(*)::int AS "pickedMatches",
          count(*) FILTER (WHERE n=1)::int AS "performanceN",
          sum(CASE WHEN win THEN 1 ELSE 0 END) FILTER (WHERE n=1)::int AS wins,
          sum(CASE WHEN win THEN 0 ELSE 1 END) FILTER (WHERE n=1)::int AS losses,
          avg(kda) FILTER (WHERE n=1)::float8 AS kda, avg(dpm) FILTER (WHERE n=1)::float8 AS dpm,
          avg(gpm) FILTER (WHERE n=1)::float8 AS gpm, avg(cspm) FILTER (WHERE n=1)::float8 AS cspm
        FROM picks GROUP BY "championId"
      ), bans AS (
        SELECT banned."championId", count(DISTINCT t."matchId")::int AS "bannedMatches"
        FROM match_teams t JOIN eligible e ON e."matchId" = t."matchId"
        CROSS JOIN LATERAL unnest(t.bans) AS banned("championId")
        WHERE banned."championId" > 0 GROUP BY banned."championId"
      ), ids AS (SELECT "championId" FROM performance UNION SELECT "championId" FROM bans)
      SELECT ids."championId", performance."championName", population.*,
        COALESCE(performance."pickedMatches",0)::int AS "pickedMatches",
        COALESCE(performance."pickedMatches",0)::int AS "gamesPlayed",
        COALESCE(performance."performanceN",0)::int AS "performanceN",
        COALESCE(bans."bannedMatches",0)::int AS "bannedMatches",
        performance.wins, performance.losses, performance.kda, performance.dpm, performance.gpm, performance.cspm,
        performance.wins * 100.0 / NULLIF(performance."performanceN",0)::float8 AS "winRate",
        COALESCE(performance."pickedMatches",0) * 100.0 / NULLIF(population."eligibleN",0)::float8 AS "pickRate",
        CASE WHEN population."bansObservedN" = population."eligibleN" THEN
          COALESCE(bans."bannedMatches",0) * 100.0 / NULLIF(population."eligibleN",0)::float8 ELSE NULL END AS "banRate"
      FROM population LEFT JOIN ids ON TRUE
      LEFT JOIN performance ON performance."championId" = ids."championId"
      LEFT JOIN bans ON bans."championId" = ids."championId" ORDER BY ids."championId"`);
    const meta = rows[0];
    const cohort = {
      patch,
      queueId,
      mapId: 11,
      eligibleN: meta?.eligibleN ?? 0,
      selectedN: meta?.selectedN ?? 0,
      excludedN: meta?.excludedN ?? 0,
      bansObservedN: meta?.bansObservedN ?? 0,
      excludedReasons: meta?.excludedReasons ?? {},
    };
    return {
      champions: rows
        .filter((row): row is ChampionPopulationRow => row.championId !== null)
        .map((row) => ({ ...row, patch, queueId })),
      cohort,
    };
  }
  async findManyByPatch(patch: string, queueId = 420) {
    return (await this.findPopulation(patch, queueId)).champions;
  }
  async findByChampionIdAndPatch(
    championId: number,
    patch: string,
    queueId = 420,
  ) {
    return this.findUnique(championId, patch, queueId);
  }
  async findUnique(championId: number, patch: string, queueId: number) {
    return (
      (await this.findManyByPatch(patch, queueId)).find(
        (row) => row.championId === championId,
      ) ?? null
    );
  }
  async findQualifiedStats(patch: string, minGames: number, queueId = 420) {
    return (await this.findManyByPatch(patch, queueId)).filter(
      (row) => row.performanceN >= minGames,
    );
  }
}
