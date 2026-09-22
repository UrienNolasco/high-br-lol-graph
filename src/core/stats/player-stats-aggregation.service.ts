import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ProcessedMatchData,
  extractPatch,
} from '../../modules/worker/pure/match.parser';
import { TimelineDto } from '../riot/dto/timeline.dto';
// Identifiers come exclusively from this module, never from a request.
const identifier = (name: string) => Prisma.raw(`"${name}"`);
@Injectable()
export class PlayerStatsAggregationService {
  async update(
    tx: Prisma.TransactionClient,
    data: ProcessedMatchData,
    timeline: TimelineDto,
  ) {
    const { match, participants } = data;
    const patch = extractPatch(match.gameVersion);
    const minutes = match.gameDuration / 60;
    const frame15 =
      match.gameDuration >= 900
        ? timeline.info.frames.find(
            (frame) => frame.timestamp >= 900_000 && frame.timestamp < 960_000,
          )
        : undefined;
    const frames = new Map(
      timeline.metadata.participants.map((puuid, index) => [
        puuid,
        frame15?.participantFrames[index + 1],
      ]),
    );
    // Consistent ordering reduces deadlocks across overlapping matches.
    for (const p of [...participants].sort(
      (a, b) => a.championId - b.championId || a.puuid.localeCompare(b.puuid),
    )) {
      await this.increment(
        tx,
        'champion_stats',
        { championId: p.championId, patch, queueId: match.queueId },
        {
          gamesPlayed: 1,
          wins: +p.win,
          losses: +!p.win,
          sumKda: p.kda,
          sumDpm: p.totalDamage / minutes,
          sumGpm: p.goldEarned / minutes,
          sumCspm: p.totalCs / minutes,
        },
        { championName: p.championName },
      );
    }
    for (const p of [...participants].sort((a, b) =>
      a.puuid.localeCompare(b.puuid),
    )) {
      const opponents = participants.filter(
        (other) => p.role && other.role === p.role && other.teamId !== p.teamId,
      );
      const own = frames.get(p.puuid);
      const opponent =
        opponents.length === 1 ? frames.get(opponents[0].puuid) : undefined;
      const valid = !!(
        own &&
        opponent &&
        ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(p.role)
      );
      const sums = {
        gamesPlayed: 1,
        wins: +p.win,
        losses: +!p.win,
        sumKda: p.kda,
        sumDpm: p.totalDamage / minutes,
        sumGpm: p.goldEarned / minutes,
        sumCspm: p.totalCs / minutes,
        sumVisionScore: p.visionScore,
      };
      for (const scope of ['ALL', patch]) {
        const keys = { puuid: p.puuid, patch: scope, queueId: match.queueId };
        await this.increment(tx, 'player_stats', keys, sums, {}, p.role);
        await this.increment(
          tx,
          'player_champion_stats',
          { ...keys, championId: p.championId },
          {
            ...sums,
            laningSamples: +valid,
            sumCsd15: valid
              ? own.minionsKilled +
                own.jungleMinionsKilled -
                opponent.minionsKilled -
                opponent.jungleMinionsKilled
              : 0,
            sumGd15: valid ? own.totalGold - opponent.totalGold : 0,
            sumXpd15: valid ? own.xp - opponent.xp : 0,
          },
          {},
          p.role,
          new Date(Number(match.gameCreation)),
        );
      }
    }
  }
  private async increment(
    tx: Prisma.TransactionClient,
    table: string,
    keys: Record<string, string | number>,
    sums: Record<string, number>,
    extra: Record<string, string>,
    role?: string,
    lastPlayedAt?: Date,
  ) {
    const entries: Array<[string, string | number | Date]> = [
      ...Object.entries(keys),
      ...Object.entries(sums),
      ...Object.entries(extra),
    ];
    const columns = entries.map(([key]) => identifier(key));
    const values = entries.map(([, value]) => Prisma.sql`${value}`);
    const updates = Object.keys(sums).map(
      (key) =>
        Prisma.sql`${identifier(key)} = ${identifier(table)}.${identifier(key)} + EXCLUDED.${identifier(key)}`,
    );
    if (role !== undefined) {
      columns.push(identifier('roleDistribution'));
      values.push(Prisma.sql`${JSON.stringify({ [role]: 1 })}::jsonb`);
      updates.push(
        Prisma.sql`"roleDistribution" = jsonb_set(${identifier(table)}."roleDistribution", ARRAY[${role}]::text[], to_jsonb(COALESCE((${identifier(table)}."roleDistribution" ->> ${role})::int, 0) + 1))`,
      );
      if (table === 'player_stats')
        updates.push(Prisma.sql`"lastUpdated" = CURRENT_TIMESTAMP`);
    }
    if (lastPlayedAt) {
      columns.push(identifier('lastPlayedAt'));
      values.push(Prisma.sql`${lastPlayedAt}`);
      updates.push(
        Prisma.sql`"lastPlayedAt" = GREATEST(${identifier(table)}."lastPlayedAt", EXCLUDED."lastPlayedAt")`,
      );
    }
    await tx.$executeRaw(Prisma.sql`INSERT INTO ${identifier(table)} (${Prisma.join(columns)})
      VALUES (${Prisma.join(values)}) ON CONFLICT (${Prisma.join(Object.keys(keys).map(identifier))})
      DO UPDATE SET ${Prisma.join(updates)}`);
  }
}
