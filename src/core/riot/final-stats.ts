/** Literal Match-V5 counters. Units are public contract; no ratios or balances. */
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
type MissingReason = 'missing_field' | 'invalid_value';

type Fields = Record<string, unknown>;
function record(value: unknown): Fields {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Fields)
    : {};
}
export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
function observed(value: unknown, kind: 'number' | 'boolean' | 'string') {
  if (kind === 'number')
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : null;
  if (kind === 'boolean') return typeof value === 'boolean' ? value : null;
  return typeof value === 'string' ? value : null;
}
function project(
  source: Fields,
  fields: Record<string, 'number' | 'boolean' | 'string'>,
) {
  const values: Record<string, number | boolean | string | null> = {};
  const missingReasons: Record<string, MissingReason> = {};
  for (const [key, kind] of Object.entries(fields)) {
    const value = observed(source[key], kind);
    values[key] = value;
    if (value === null)
      missingReasons[key] =
        source[key] == null ? 'missing_field' : 'invalid_value';
  }
  const totalFields = Object.keys(fields).length;
  const validFields = totalFields - Object.keys(missingReasons).length;
  return {
    values,
    missingReasons,
    quality: {
      validFields,
      totalFields,
      coverage: totalFields ? validFields / totalFields : null,
    },
  };
}

export function projectFinalStats(participant: unknown) {
  const source = record(participant);
  const fields = Object.fromEntries([
    ...Object.keys(FINAL_STAT_UNITS).map((key) => [key, 'number']),
    ...FINAL_FLAG_FIELDS.map((key) => [key, 'boolean']),
  ]) as Record<string, 'number' | 'boolean'>;
  const projection = project(source, fields);
  return {
    projectionVersion: 1,
    source: 'MatchRaw.summary.info.participants',
    origin: 'observed',
    ...projection,
    values: projection.values as Record<FinalStatField, number | null> &
      Record<FinalFlagField, boolean | null>,
  };
}

export function projectFinalContext(info: unknown) {
  return {
    projectionVersion: 1,
    source: 'MatchRaw.summary.info',
    origin: 'observed',
    ...project(record(info), {
      gameStartTimestamp: 'number',
      gameEndTimestamp: 'number',
      gameId: 'number',
      platformId: 'string',
      gameType: 'string',
      endOfGameResult: 'string',
      tournamentCode: 'string',
    }),
  };
}

export function projectFinalObjectives(objectives: unknown) {
  const source = record(objectives);
  const types = [
    ...new Set<string>([...FINAL_OBJECTIVE_TYPES, ...Object.keys(source)]),
  ].sort();
  const values: Record<
    string,
    { first: boolean | null; kills: number | null; lost: boolean | null } | null
  > = {};
  const missingReasons: Record<string, MissingReason> = {};
  let validFields = 0;
  const totalFields = types.length * 3;
  for (const type of types) {
    if (source[type] == null) {
      values[type] = null;
      missingReasons[type] = 'missing_field';
      continue;
    }
    if (typeof source[type] !== 'object' || Array.isArray(source[type])) {
      values[type] = null;
      missingReasons[type] = 'invalid_value';
      continue;
    }
    const result = project(record(source[type]), {
      first: 'boolean',
      kills: 'number',
      lost: 'boolean',
    });
    values[type] = result.values as NonNullable<(typeof values)[string]>;
    for (const [field, reason] of Object.entries(result.missingReasons))
      missingReasons[`${type}.${field}`] = reason;
    validFields += result.quality.validFields;
  }
  return {
    projectionVersion: 1,
    source: 'MatchRaw.summary.info.teams.objectives',
    origin: 'observed',
    values,
    missingReasons,
    unknownTypes: types.filter(
      (type) => !(FINAL_OBJECTIVE_TYPES as readonly string[]).includes(type),
    ),
    quality: {
      validFields,
      totalFields,
      coverage: totalFields ? validFields / totalFields : null,
    },
  };
}

export function participantDisplayName(participant: {
  puuid: string;
  summonerName?: string | null;
  riotIdGameName?: string | null;
  riotIdTagline?: string | null;
}) {
  const gameName = optionalText(participant.riotIdGameName);
  const tag = optionalText(participant.riotIdTagline);
  const legacyName = optionalText(participant.summonerName);
  return {
    displayName: gameName
      ? `${gameName}${tag ? `#${tag}` : ''}`
      : (legacyName ?? participant.puuid),
    displayNameSource: gameName
      ? 'riot_id'
      : legacyName
        ? 'summoner_name'
        : 'puuid',
  };
}
