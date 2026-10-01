import type {
  ChampionContextFilters,
  ChampionContextMatch,
} from './champion-context-reader';
import type { TimelineSnapshotProjection } from '../contracts/normalized-snapshots';
export interface AdvantageMatch extends ChampionContextMatch {
  durationMs: number;
  processing: { status: string; processingVersion: number | null } | null;
  projection: TimelineSnapshotProjection | null;
  structures: {
    metricVersion: number;
    processingVersion: number;
    timestampMs: number | null;
    beneficiaryTeamId: number | null;
    frameIndex: number;
    eventIndex: number;
  }[];
}
export interface AdvantageCohort {
  matches: AdvantageMatch[];
  availableMatches: number;
  truncated: boolean;
}
export interface AdvantageReader {
  read(filters: ChampionContextFilters): Promise<AdvantageCohort>;
}
export const ADVANTAGE_READER = Symbol('ADVANTAGE_READER');
