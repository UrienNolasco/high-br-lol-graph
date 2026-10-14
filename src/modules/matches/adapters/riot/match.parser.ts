import {
  projectFinalStats,
  projectFinalContext,
  projectFinalObjectives,
} from './final-stats';
import { optionalText } from '../../contracts/participant-display';
import { MatchDto, ParticipantDto } from '../../../../core/riot/dto/match.dto';
import type { TimelineParticipant } from '../../../../core/riot/dto/timeline.dto';
import { InvalidMatchError } from '../../../../lib/processing-errors';
import type { ProcessedMatchData } from '../../contracts/normalized-match';
import { projectFinalInventory } from './final-inventory';
import {
  championPopulationEligibility,
  bansAvailable,
} from '../../contracts/champion-population';

export function buildParticipantMap(
  timelinePuuids: readonly string[],
  matchParticipants: readonly Pick<ParticipantDto, 'participantId' | 'puuid'>[],
  timelineParticipants?: readonly TimelineParticipant[],
): Map<number, string> {
  const invalid = (): never => {
    throw new InvalidMatchError('Invalid match/timeline participant identity');
  };
  if (
    !Array.isArray(matchParticipants) ||
    !matchParticipants.length ||
    !Array.isArray(timelinePuuids)
  )
    invalid();
  const map = new Map<number, string>();
  const puuids = new Set<string>();
  for (const participant of matchParticipants) {
    if (
      !participant ||
      !Number.isSafeInteger(participant.participantId) ||
      participant.participantId <= 0 ||
      typeof participant.puuid !== 'string' ||
      !participant.puuid ||
      map.has(participant.participantId) ||
      puuids.has(participant.puuid)
    )
      invalid();
    map.set(participant.participantId, participant.puuid);
    puuids.add(participant.puuid);
  }
  // Metadata is a membership list, never an ID-to-PUUID mapping.
  if (
    timelinePuuids.length !== map.size ||
    new Set(timelinePuuids).size !== map.size ||
    timelinePuuids.some((puuid) => !puuids.has(puuid))
  )
    invalid();
  // Preserve support for stored payloads without info.participants. If supplied,
  // its explicit pairs must agree; never silently prefer one conflicting source.
  if (timelineParticipants !== undefined) {
    if (
      !Array.isArray(timelineParticipants) ||
      timelineParticipants.length !== map.size
    )
      invalid();
    const ids = new Set<number>();
    for (const participant of timelineParticipants as readonly TimelineParticipant[]) {
      if (
        !participant ||
        !map.has(participant.participantId) ||
        map.get(participant.participantId) !== participant.puuid ||
        ids.has(participant.participantId)
      )
        invalid();
      ids.add(participant.participantId);
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
