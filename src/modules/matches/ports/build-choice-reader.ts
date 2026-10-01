import type { ProgressionEvent } from '../contracts/calculations/item-ledger';
import type { CanonicalRole } from '../contracts/eligibility';
import type { TimelineSnapshotProjection } from '../contracts/normalized-snapshots';

export interface BuildChoiceFilters {
  patch: string;
  championId: number;
  role: CanonicalRole;
  checkpointMs: number;
  opponentChampionId?: number;
  queueId: number;
  fromMs?: number;
  toMs?: number;
  limit: number;
}
export interface BuildChoiceParticipant {
  puuid: string;
  championId: number;
  teamId: number;
  role: string;
  win: boolean;
  runes: unknown;
  spells: number[];
}
export interface BuildChoiceMatch {
  matchId: string;
  gameVersion: string;
  gameDuration: number;
  populationEligible: boolean | null;
  participants: BuildChoiceParticipant[];
  timelineProjection: TimelineSnapshotProjection | null;
  events: ProgressionEvent[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
}
export interface BuildChoiceCohort {
  matches: BuildChoiceMatch[];
  totalMatches: number;
  truncated: boolean;
}
export interface BuildChoiceReader {
  findBuildChoiceCohort(
    filters: BuildChoiceFilters,
  ): Promise<BuildChoiceCohort>;
}
export const BUILD_CHOICE_READER = Symbol('BUILD_CHOICE_READER');
