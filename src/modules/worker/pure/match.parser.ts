import { MatchDto, ParticipantDto } from '../../core/riot/dto/match.dto';

export interface ProcessedMatchData {
  match: {
    matchId: string;
    gameCreation: bigint;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    gameVersion: string;
    mapId: number;
  };
  teams: Array<{
    matchId: string;
    teamId: number;
    win: boolean;
    bans: number[];
    objectivesTimeline: unknown;
  }>;
  participants: Array<{
    matchId: string;
    puuid: string;
    summonerName: string;
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
    runes: unknown;
    challenges: unknown;
    pings: unknown;
    spells: number[];
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
  };

  const teams =
    info.teams?.map((team) => ({
      matchId: metadata.matchId,
      teamId: team.teamId,
      win: team.win,
      bans: team.bans?.map((b) => b.championId).filter((id) => id > 0) || [],
      objectivesTimeline: team.objectives,
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
        runes: p.perks,
        challenges: p.challenges,
        pings,
        spells: [p.summoner1Id, p.summoner2Id],
      };
    },
  );

  return { match, teams, participants };
}

export function extractPatch(gameVersion: string): string {
  const parts = gameVersion.split('.');
  return `${parts[0]}.${parts[1]}`;
}
