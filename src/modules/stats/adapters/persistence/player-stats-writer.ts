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

type StatsTable = 'champion_stats' | 'player_stats' | 'player_champion_stats';
export interface StatsIncrement {
  table: StatsTable;
  keys: Record<string, string | number>;
  sums: Record<string, number>;
  extra: Record<string, string>;
  role?: string;
  lastPlayedAt?: Date;
}

/** Prisma adapter for the public stats writer port. */
@Injectable()
export class PlayerStatsAggregationService implements StatsWriter {
  async update(
    transaction: TransactionContext,
    input: StatsAggregateInput,
  ): Promise<void> {
    const tx = fromTransactionContext(transaction);
    const increments = this.prepare(input);
    for (const table of [
      'champion_stats',
      'player_stats',
      'player_champion_stats',
    ] as const) {
      const pending = increments
        .filter((row) => row.table === table)
        .sort((a, b) =>
          JSON.stringify(a.keys).localeCompare(JSON.stringify(b.keys)),
        );
      // One conflict target per statement. Keep repeated keys in successive
      // batches: folding floating-point sums in JS would change SQL's order of
      // addition to an existing aggregate. Normal ranked matches need 3 writes.
      while (pending.length) {
        const seen = new Set<string>();
        const batch: StatsIncrement[] = [];
        for (let i = 0; i < pending.length; ) {
          const key = JSON.stringify(pending[i].keys);
          if (seen.has(key)) {
            i++;
            continue;
          }
          seen.add(key);
          batch.push(pending.splice(i, 1)[0]);
        }
        await this.writeBatch(tx, table, batch);
      }
    }
  }

  prepare(input: StatsAggregateInput): StatsIncrement[] {
    const increments: StatsIncrement[] = [];
    const increment = (
      table: StatsTable,
      keys: StatsIncrement['keys'],
      sums: StatsIncrement['sums'],
      extra: StatsIncrement['extra'],
      role?: string,
      lastPlayedAt?: Date,
    ) => {
      increments.push({ table, keys, sums, extra, role, lastPlayedAt });
    };
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
      increment(
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

    // Preserve the legacy order when constructing deltas. SQL acquisition
    // order is defined separately by table and key in update().
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
        increment('player_stats', keys, sums, {}, p.role);
        increment(
          'player_champion_stats',
          { ...keys, championId: p.championId },
          {
            ...sums,
            laningSamples: +valid,
            sumCsd15: valid
              ? own.minionsKilled! +
                own.jungleMinionsKilled! -
                opponent!.minionsKilled! -
                opponent!.jungleMinionsKilled!
              : 0,
            sumGd15: valid ? own.totalGold! - opponent!.totalGold! : 0,
            sumXpd15: valid ? own.xp! - opponent!.xp! : 0,
          },
          {},
          p.role,
          new Date(Number(match.gameCreation)),
        );
      }
    }
    return increments;
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

  private async writeBatch(
    tx: Prisma.TransactionClient,
    tableName: StatsTable,
    rows: readonly StatsIncrement[],
  ) {
    const table = identifier(tableName);
    const keys = Object.keys(rows[0].keys);
    const sums = Object.keys(rows[0].sums);
    const roles = tableName !== 'champion_stats';
    const dates = tableName === 'player_champion_stats';
    const columns = [
      ...keys,
      ...sums,
      ...Object.keys(rows[0].extra),
      ...(roles ? ['roleDistribution'] : []),
      ...(dates ? ['lastPlayedAt'] : []),
    ];
    const values = rows.map((row) => {
      const data = { ...row.keys, ...row.sums, ...row.extra };
      return Prisma.sql`(${Prisma.join(
        columns.map((column) =>
          column === 'roleDistribution'
            ? Prisma.sql`${JSON.stringify(row.role === undefined ? {} : { [row.role]: 1 })}::jsonb`
            : column === 'lastPlayedAt'
              ? Prisma.sql`${row.lastPlayedAt ?? null}`
              : Prisma.sql`${data[column]}`,
        ),
      )})`;
    });
    const updates = sums.map(
      (column) =>
        Prisma.sql`${identifier(column)}=${table}.${identifier(column)}+EXCLUDED.${identifier(column)}`,
    );
    if (roles)
      updates.push(Prisma.sql`"roleDistribution"=(SELECT COALESCE(jsonb_object_agg(key,total),'{}'::jsonb) FROM
      (SELECT key,sum(value::integer) total FROM
        (SELECT key,value FROM jsonb_each_text(${table}."roleDistribution")
         UNION ALL SELECT key,value FROM jsonb_each_text(EXCLUDED."roleDistribution")) entries GROUP BY key) counts)`);
    if (tableName === 'player_stats')
      updates.push(
        Prisma.sql`"lastUpdated"=CASE WHEN EXCLUDED."roleDistribution"='{}'::jsonb THEN ${table}."lastUpdated" ELSE CURRENT_TIMESTAMP END`,
      );
    if (dates)
      updates.push(
        Prisma.sql`"lastPlayedAt"=GREATEST(${table}."lastPlayedAt",EXCLUDED."lastPlayedAt")`,
      );
    await tx.$executeRaw(Prisma.sql`INSERT INTO ${table} (${Prisma.join(columns.map(identifier))}) VALUES ${Prisma.join(values)}
      ON CONFLICT (${Prisma.join(keys.map(identifier))}) DO UPDATE SET ${Prisma.join(updates)}`);
  }
}
