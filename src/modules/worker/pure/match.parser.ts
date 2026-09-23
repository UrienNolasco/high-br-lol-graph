import {
  projectFinalStats,
  projectFinalContext,
  projectFinalObjectives,
  optionalText,
} from '../../../core/riot/final-stats';
import { MatchDto, ParticipantDto } from '../../../core/riot/dto/match.dto';
import { Prisma } from '@prisma/client';
import { projectFinalInventory } from '../../../core/riot/final-inventory';

export interface ProcessedMatchData {
  match: {
    matchId: string;
    gameCreation: bigint;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    gameVersion: string;
    mapId: number;
    finalContext: Prisma.InputJsonValue;
  };
  teams: Array<{
    matchId: string;
    teamId: number;
    win: boolean;
    bans: number[];
    objectivesTimeline: Prisma.InputJsonValue;
    finalObjectives: Prisma.InputJsonValue;
  }>;
  participants: Array<{
    matchId: string;
    puuid: string;
    summonerName: string;
    riotIdGameName: string | null;
    riotIdTagline: string | null;
    finalStats: Prisma.InputJsonValue;
    championId: number;
    championName: string;
    teamId: number;
    role: string;
    lane: string;
    win: boolean;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    goldEarned: number;
    totalDamage: number;
    damageTaken: number;
    visionScore: number;
    totalCs: number;
    runes: Prisma.InputJsonValue;
    challenges: Prisma.InputJsonValue;
    pings: Prisma.InputJsonValue;
    spells: number[];
    finalInventory: Prisma.InputJsonValue;
  }>;
}

export function buildParticipantMap(
  timelinePuuids: string[],
  matchParticipants: ParticipantDto[],
  onMismatch?: (participantId: number, puuid: string) => void,
): Map<number, string> {
  const map = new Map<number, string>();

  timelinePuuids.forEach((puuid, index) => {
    map.set(index + 1, puuid);
  });

  const participantPuuids = new Set(matchParticipants.map((p) => p.puuid));
  for (const [participantId, puuid] of map.entries()) {
    if (!participantPuuids.has(puuid)) {
      onMismatch?.(participantId, puuid);
    }
  }

  return map;
}

export function parseMatchData(matchDto: MatchDto): ProcessedMatchData {
  const { info, metadata } = matchDto;

  const match = {
    matchId: metadata.matchId,
    gameCreation: BigInt(info.gameCreation),
    gameDuration: info.gameDuration,
    gameMode: info.gameMode,
    queueId: info.queueId,
    gameVersion: info.gameVersion,
    mapId: info.mapId,
    finalContext: projectFinalContext(info) as unknown as Prisma.InputJsonValue,
  };

  const teams =
    info.teams?.map((team) => ({
      matchId: metadata.matchId,
      teamId: team.teamId,
      win: team.win,
      bans: team.bans?.map((b) => b.championId).filter((id) => id > 0) || [],
      // Totals are summary observations; the timeline is populated only from events.
      objectivesTimeline: [],
      finalObjectives: projectFinalObjectives(
        team.objectives,
      ) as unknown as Prisma.InputJsonValue,
    })) || [];

  const participants = info.participants.map(
    (p): ProcessedMatchData['participants'][0] => {
      const pings: Record<string, number> = {};
      for (const [key, value] of Object.entries(p)) {
        if (key.endsWith('Pings') && typeof value === 'number') {
          pings[key] = value;
        }
      }

      const deaths: number = p.deaths || 1;
      const kda = (p.kills + p.assists) / deaths;

      return {
        matchId: metadata.matchId,
        puuid: p.puuid,
        summonerName: p.summonerName,
        riotIdGameName: optionalText(p.riotIdGameName),
        riotIdTagline: optionalText(p.riotIdTagline),
        finalStats: projectFinalStats(p) as unknown as Prisma.InputJsonValue,
        championId: p.championId,
        championName: p.championName,
        teamId: p.teamId,
        role: p.teamPosition || p.individualPosition || '',
        lane: p.lane || p.individualPosition || '',
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda,
        goldEarned: p.goldEarned,
        totalDamage: p.totalDamageDealtToChampions,
        damageTaken: p.totalDamageTaken,
        visionScore: p.visionScore || 0,
        totalCs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
        // PerksDto lacks an index signature, same limitation as TeamObjectivesDto above.
        runes: p.perks as unknown as Prisma.InputJsonValue,
        challenges: p.challenges as unknown as Prisma.InputJsonValue,
        pings: pings as unknown as Prisma.InputJsonValue,
        spells: [p.summoner1Id, p.summoner2Id],
        finalInventory: projectFinalInventory(
          p,
        ) as unknown as Prisma.InputJsonValue,
      };
    },
  );

  return { match, teams, participants };
}

export function extractPatch(gameVersion: string): string {
  const parts = gameVersion.split('.');
  return `${parts[0]}.${parts[1]}`;
}
