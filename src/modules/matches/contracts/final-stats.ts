/** Literal Match-V5 counters. Units are part of the public contract. */
export const FINAL_STAT_UNITS = {
  wardsPlaced: 'count',
  wardsKilled: 'count',
  detectorWardsPlaced: 'count',
  visionWardsBoughtInGame: 'count',
  sightWardsBoughtInGame: 'count',
  visionScore: 'score',
  totalDamageDealt: 'damage',
  physicalDamageDealt: 'damage',
  magicDamageDealt: 'damage',
  trueDamageDealt: 'damage',
  totalDamageDealtToChampions: 'damage',
  physicalDamageDealtToChampions: 'damage',
  magicDamageDealtToChampions: 'damage',
  trueDamageDealtToChampions: 'damage',
  totalDamageTaken: 'damage',
  physicalDamageTaken: 'damage',
  magicDamageTaken: 'damage',
  trueDamageTaken: 'damage',
  damageSelfMitigated: 'damage',
  damageDealtToBuildings: 'damage',
  damageDealtToObjectives: 'damage',
  damageDealtToTurrets: 'damage',
  damageDealtToEpicMonsters: 'damage',
  totalHeal: 'health',
  totalHealsOnTeammates: 'health',
  totalDamageShieldedOnTeammates: 'damage',
  totalUnitsHealed: 'count',
  timeCCingOthers: 'seconds',
  totalTimeCCDealt: 'seconds',
  totalTimeSpentDead: 'seconds',
  timePlayed: 'seconds',
  longestTimeSpentLiving: 'seconds',
  totalMinionsKilled: 'cs',
  neutralMinionsKilled: 'cs',
  totalAllyJungleMinionsKilled: 'cs',
  totalEnemyJungleMinionsKilled: 'cs',
  spell1Casts: 'count',
  spell2Casts: 'count',
  spell3Casts: 'count',
  spell4Casts: 'count',
  summoner1Casts: 'count',
  summoner2Casts: 'count',
  goldEarned: 'gold',
  goldSpent: 'gold',
  champExperience: 'xp',
  champLevel: 'level',
  baronKills: 'count',
  dragonKills: 'count',
  turretKills: 'count',
  turretTakedowns: 'count',
  inhibitorKills: 'count',
  inhibitorTakedowns: 'count',
  nexusKills: 'count',
  nexusTakedowns: 'count',
  objectivesStolen: 'count',
  objectivesStolenAssists: 'count',
} as const;

export const FINAL_FLAG_FIELDS = [
  'gameEndedInSurrender',
  'gameEndedInEarlySurrender',
  'teamEarlySurrendered',
] as const;

export const FINAL_OBJECTIVE_TYPES = [
  'atakhan',
  'baron',
  'champion',
  'dragon',
  'horde',
  'inhibitor',
  'riftHerald',
  'tower',
] as const;

export type FinalStatField = keyof typeof FINAL_STAT_UNITS;
export type FinalFlagField = (typeof FINAL_FLAG_FIELDS)[number];
export type FinalProjectionMissingReason = 'missing_field' | 'invalid_value';

export interface FinalProjectionQuality {
  validFields: number;
  totalFields: number;
  coverage: number | null;
}

export interface FinalStats {
  projectionVersion: 1;
  source: 'MatchRaw.summary.info.participants';
  origin: 'observed';
  values: Record<FinalStatField, number | null> &
    Record<FinalFlagField, boolean | null>;
  missingReasons: Record<string, FinalProjectionMissingReason>;
  quality: FinalProjectionQuality;
}

export interface FinalContext {
  projectionVersion: 1;
  source: 'MatchRaw.summary.info';
  origin: 'observed';
  values: {
    gameStartTimestamp: number | null;
    gameEndTimestamp: number | null;
    gameId: number | null;
    platformId: string | null;
    gameType: string | null;
    endOfGameResult: string | null;
    tournamentCode: string | null;
  };
  missingReasons: Record<string, FinalProjectionMissingReason>;
  quality: FinalProjectionQuality;
}

export interface FinalObjectiveValue {
  first: boolean | null;
  kills: number | null;
  lost: boolean | null;
}

export interface FinalObjectives {
  projectionVersion: 1;
  source: 'MatchRaw.summary.info.teams.objectives';
  origin: 'observed';
  values: Record<string, FinalObjectiveValue | null>;
  missingReasons: Record<string, FinalProjectionMissingReason>;
  unknownTypes: string[];
  quality: FinalProjectionQuality;
}
