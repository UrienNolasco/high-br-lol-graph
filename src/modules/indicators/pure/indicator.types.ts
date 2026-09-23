import { DatasetFilters } from '../../../core/dataset/dataset-query';
import { IndicatorCursor } from './indicator-cursor';
import { IndicatorFamily } from './indicator-catalog';
export interface IndicatorParticipant {
  puuid: string;
  championId: number;
  championName: string;
  role: string | null;
  finalStats: unknown;
  challenges: unknown;
  pings: unknown;
}
export interface IndicatorMatch {
  matchId: string;
  gameCreation: bigint;
  gameDuration: number;
  gameVersion: string;
  mapId: number;
  queueId: number;
  populationEligible: boolean | null;
  populationExclusionReason: string | null;
}
export interface IndicatorInput {
  match: IndicatorMatch;
  participant: IndicatorParticipant;
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
export interface IndicatorOptions {
  family?: IndicatorFamily;
  limit: number;
  groupLimit: number;
  groupOffset: number;
  evidenceLimit: number;
}
export interface IndicatorQuery {
  filters: DatasetFilters;
  options: IndicatorOptions;
  after?: IndicatorCursor;
  afterToken?: string;
}
export const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function provenance(input: IndicatorInput) {
  const p = input.processing;
  const known =
    p?.status === 'COMPLETED' &&
    p.processingVersion !== null &&
    p.processingVersion >= 2 &&
    p.completedAt !== null &&
    Number.isFinite(p.completedAt.getTime());
  return {
    known,
    processingVersion: known ? p.processingVersion : null,
    processedAt: known ? p.completedAt!.toISOString() : null,
    reason: known
      ? null
      : p?.processingVersion != null && p.processingVersion < 2
        ? 'unsupported_processing_version'
        : 'missing_processing_metadata',
  };
}
export const matchIndicatorHref = (input: IndicatorInput) =>
  `/api/v1/matches/${encodeURIComponent(input.match.matchId)}/indicators/${encodeURIComponent(input.participant.puuid)}`;
