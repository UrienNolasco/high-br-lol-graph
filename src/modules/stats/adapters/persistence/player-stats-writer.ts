import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromTransactionContext } from '../../../../core/prisma/transaction-context';
import { extractPatch } from '../../../matches/contracts/calculations/patch';
import type {
  SnapshotFrame,
  ParticipantSnapshot,
} from '../../../matches/contracts/normalized-snapshots';
import { LEGACY_LANE_CHECKPOINT } from '../../../matches/contracts/temporal';
import type { StatsAggregateInput } from '../../contracts/aggregate';
import type { StatsWriter } from '../../ports/stats-writer';
import type { TransactionContext } from '../../../../lib/transaction-context';

const identifier = (name: string) => Prisma.raw(`"${name}"`);
const ALLOWED_ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

/** Prisma adapter for the public stats writer port. */
@Injectable()
export class PlayerStatsAggregationService implements StatsWriter {
  async update(
    transaction: TransactionContext,
    input: StatsAggregateInput,
  ): Promise<void> {
    const tx = fromTransactionContext(transaction);
    const { match, participants } = input.matchData;
    const patch = extractPatch(match.gameVersion);
    const minutes = match.gameDuration / 60;
    const frame15 = this.firstLaneFrame(
      input.timeline.snapshotProjection.frames,
      match.gameDuration,
    );
    const snapshots = this.snapshotsByPuuid(frame15);

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

    // The player row is acquired before its player/champion row.  ALL is
    // intentionally written before the patch row, preserving lock order.
    for (const p of [...participants].sort((a, b) =>
      a.puuid.localeCompare(b.puuid),
    )) {
      const opponents = participants.filter(
        (other) => p.role && other.role === p.role && other.teamId !== p.teamId,
      );
      const own = snapshots.get(p.puuid);
      const opponent =
        opponents.length === 1 ? snapshots.get(opponents[0].puuid) : undefined;
      const valid = this.validLaneSample(p.role, own, opponent);
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
              ? own!.minionsKilled! +
                own!.jungleMinionsKilled! -
                opponent!.minionsKilled! -
                opponent!.jungleMinionsKilled!
              : 0,
            sumGd15: valid ? own!.totalGold! - opponent!.totalGold! : 0,
            sumXpd15: valid ? own!.xp! - opponent!.xp! : 0,
          },
          {},
          p.role,
          new Date(Number(match.gameCreation)),
        );
      }
    }
  }

  private firstLaneFrame(
    frames: readonly SnapshotFrame[],
    duration: number,
  ): SnapshotFrame | undefined {
    if (duration < 900) return undefined;
    // Do not sort: the legacy behavior is the first source frame in the
    // original order within the half-open 15-minute window.
    return frames.find(
      (frame) =>
        typeof frame.timestamp === 'number' &&
        Number.isFinite(frame.timestamp) &&
        frame.timestamp >= LEGACY_LANE_CHECKPOINT.startMs &&
        frame.timestamp < LEGACY_LANE_CHECKPOINT.endMs,
    );
  }

  private snapshotsByPuuid(
    frame: SnapshotFrame | undefined,
  ): Map<string, ParticipantSnapshot> {
    const result = new Map<string, ParticipantSnapshot>();
    if (!frame) return result;
    // Object insertion order is the normalized source order.  The snapshot's
    // participantId and puuid are retained together by the matches adapter;
    // no array index is used here.
    for (const snapshot of Object.values(frame.participantFrames)) {
      if (snapshot.puuid) result.set(snapshot.puuid, snapshot);
    }
    return result;
  }

  private validLaneSample(
    role: string,
    own: ParticipantSnapshot | undefined,
    opponent: ParticipantSnapshot | undefined,
  ): own is ParticipantSnapshot {
    if (!own || !opponent || !ALLOWED_ROLES.has(role)) return false;
    return [
      own.totalGold,
      own.xp,
      own.minionsKilled,
      own.jungleMinionsKilled,
      opponent.totalGold,
      opponent.xp,
      opponent.minionsKilled,
      opponent.jungleMinionsKilled,
    ].every((value) => typeof value === 'number' && Number.isFinite(value));
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
