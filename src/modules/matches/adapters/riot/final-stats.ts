import { optionalText } from '../../contracts/participant-display';
import {
  FINAL_FLAG_FIELDS,
  FINAL_OBJECTIVE_TYPES,
  FINAL_STAT_UNITS,
} from '../../contracts/final-stats';
import type {
  FinalFlagField,
  FinalStatField,
} from '../../contracts/final-stats';

type MissingReason = 'missing_field' | 'invalid_value';
type Fields = Record<string, unknown>;
function record(value: unknown): Fields {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Fields)
    : {};
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
    projectionVersion: 1 as const,
    source: 'MatchRaw.summary.info.participants' as const,
    origin: 'observed' as const,
    ...projection,
    values: projection.values as Record<FinalStatField, number | null> &
      Record<FinalFlagField, boolean | null>,
  };
}

export function projectFinalContext(info: unknown) {
  const projection = project(record(info), {
    gameStartTimestamp: 'number',
    gameEndTimestamp: 'number',
    gameId: 'number',
    platformId: 'string',
    gameType: 'string',
    endOfGameResult: 'string',
    tournamentCode: 'string',
  });
  return {
    projectionVersion: 1 as const,
    source: 'MatchRaw.summary.info' as const,
    origin: 'observed' as const,
    ...projection,
    values: projection.values as {
      gameStartTimestamp: number | null;
      gameEndTimestamp: number | null;
      gameId: number | null;
      platformId: string | null;
      gameType: string | null;
      endOfGameResult: string | null;
      tournamentCode: string | null;
    },
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
    projectionVersion: 1 as const,
    source: 'MatchRaw.summary.info.teams.objectives' as const,
    origin: 'observed' as const,
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
