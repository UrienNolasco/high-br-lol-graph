import type {
  MatchParticipantInput,
  MatchParticipantRead,
  MatchRead,
  MatchProcessingRead,
} from '../../matches/contracts/participant-reader';
import { DatasetFilters } from '../../dataset/contracts/query';
import { IndicatorCursor } from './indicator-cursor';
import { IndicatorFamily } from './indicator-catalog';
export type IndicatorParticipant = MatchParticipantRead;
export type IndicatorMatch = MatchRead;
export type IndicatorProcessing = MatchProcessingRead;
export type IndicatorInput = MatchParticipantInput;
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
