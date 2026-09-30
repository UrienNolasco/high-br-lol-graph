import { Prisma } from '@prisma/client';
import { PlayerMatchDto, PlayerMatchesQueryDto } from '../dto/player-match.dto';

export type MatchRow = {
  matchId: string;
  championId: number;
  championName: string;
  role: string;
  lane: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  goldEarned: number;
  totalDamage: number;
  visionScore: number;
  win: boolean;
  csGraph: number[];
  totalCs?: number;
  match: {
    gameCreation: bigint;
    gameDuration: number;
    queueId: number;
  };
};

export const MATCH_SELECT_FIELDS = {
  matchId: true,
  championId: true,
  championName: true,
  role: true,
  lane: true,
  kills: true,
  deaths: true,
  assists: true,
  kda: true,
  goldEarned: true,
  totalDamage: true,
  visionScore: true,
  win: true,
  csGraph: true,
  totalCs: true,
  match: {
    select: {
      gameCreation: true,
      gameDuration: true,
      queueId: true,
    },
  },
} as const;

export function buildMatchWhere(
  puuid: string,
  filters: PlayerMatchesQueryDto,
  cursorGameCreation?: bigint,
): Prisma.MatchParticipantWhereInput {
  const matchConditions: Prisma.MatchWhereInput = {
    queueId: filters.queueId ?? 420,
  };

  if (
    filters.startDate ||
    filters.endDate ||
    cursorGameCreation !== undefined
  ) {
    matchConditions.gameCreation = {};
    if (filters.startDate)
      matchConditions.gameCreation.gte = BigInt(filters.startDate);
    if (filters.endDate)
      matchConditions.gameCreation.lte = BigInt(filters.endDate);
    if (cursorGameCreation !== undefined)
      matchConditions.gameCreation.lt = cursorGameCreation;
  }

  const where: Prisma.MatchParticipantWhereInput = {
    puuid,
    match: matchConditions,
  };

  if (filters.championId) {
    where.championId = filters.championId;
  }

  if (filters.role) {
    where.role = ['MID', 'MIDDLE'].includes(filters.role)
      ? { in: ['MID', 'MIDDLE'] }
      : filters.role;
  }

  if (filters.result) {
    where.win = filters.result === 'win';
  }

  return where;
}

export function buildMatchOrderBy(
  sortBy?: string,
): Prisma.MatchParticipantOrderByWithRelationInput {
  switch (sortBy) {
    case 'kda':
      return { kda: 'desc' as const };
    case 'kills':
      return { kills: 'desc' as const };
    case 'damage':
      return { totalDamage: 'desc' as const };
    default:
      return { match: { gameCreation: 'desc' as const } };
  }
}

export function toPlayerMatchDto(match: MatchRow): PlayerMatchDto {
  const gameDurationMinutes = match.match.gameDuration / 60;
  const cspm =
    typeof match.totalCs === 'number' &&
    Number.isFinite(match.totalCs) &&
    gameDurationMinutes > 0
      ? match.totalCs / gameDurationMinutes
      : null;

  return {
    matchId: match.matchId,
    championId: match.championId,
    championName: match.championName,
    role: match.role,
    lane: match.lane,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    kda: match.kda,
    goldEarned: match.goldEarned,
    totalDamage: match.totalDamage,
    visionScore: match.visionScore,
    cspm,
    cspmReason:
      cspm === null
        ? gameDurationMinutes <= 0
          ? 'zero_denominator'
          : 'missing_field'
        : null,
    win: match.win,
    gameCreation: Number(match.match.gameCreation),
    gameDuration: match.match.gameDuration,
    queueId: match.match.queueId,
  };
}
