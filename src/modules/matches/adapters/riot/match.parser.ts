import {
  projectFinalStats,
  projectFinalContext,
  projectFinalObjectives,
} from './final-stats';
import { optionalText } from '../../contracts/participant-display';
import { MatchDto, ParticipantDto } from '../../../../core/riot/dto/match.dto';
import type { ProcessedMatchData } from '../../contracts/normalized-match';
import { projectFinalInventory } from './final-inventory';
import {
  championPopulationEligibility,
  bansAvailable,
} from '../../contracts/champion-population';

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
    ...championPopulationEligibility(info),
    matchId: metadata.matchId,
    gameCreation: BigInt(info.gameCreation),
    gameDuration: info.gameDuration,
    gameMode: info.gameMode,
    queueId: info.queueId,
    gameVersion: info.gameVersion,
    mapId: info.mapId,
    finalContext: projectFinalContext(info),
  };

  const teams =
    info.teams?.map((team) => ({
      matchId: metadata.matchId,
      teamId: team.teamId,
      win: team.win,
      bans: Array.isArray(team.bans)
        ? team.bans
            .filter(
              (b) => b && Number.isInteger(b.championId) && b.championId > 0,
            )
            .map((b) => b.championId)
        : [],
      bansAvailable: bansAvailable(team.bans),
      // Totals are summary observations; the timeline is populated only from events.
      objectivesTimeline: [],
      finalObjectives: projectFinalObjectives(team.objectives),
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
        finalStats: projectFinalStats(p),
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
        runes: p.perks,
        challenges: p.challenges,
        pings: pings,
        spells: [p.summoner1Id, p.summoner2Id],
        finalInventory: projectFinalInventory(p),
      };
    },
  );

  return { match, teams, participants };
}
