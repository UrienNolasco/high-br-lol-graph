/** Public read model for participant based historical consumers. */
export interface MatchParticipantQuery {
  playerId?: string;
  patch?: string;
  queueId?: number;
  mapId?: number;
  championId?: number;
  role?: string;
  fromMs?: number;
  toMs?: number;
  eligibleOnly: boolean;
}

export interface MatchParticipantRead {
  puuid: string;
  championId: number;
  championName: string;
  role: string | null;
  finalStats: unknown;
  challenges: unknown;
  pings: unknown;
}

export interface MatchRead {
  matchId: string;
  gameCreation: bigint;
  gameDuration: number;
  gameVersion: string;
  mapId: number;
  queueId: number;
  populationEligible: boolean | null;
  populationExclusionReason: string | null;
}

export interface MatchProcessingRead {
  status: string;
  processingVersion: number | null;
  completedAt: Date | null;
}

export interface MatchParticipantInput {
  match: MatchRead;
  participant: MatchParticipantRead;
  processing: MatchProcessingRead | null;
}

export interface MatchParticipantHistoryPage {
  inputs: MatchParticipantInput[];
  total: number;
  truncated: boolean;
  hasMore: boolean;
}

export interface MatchParticipantCursor {
  gameCreation: bigint;
  matchId: string;
}

/** Matches owns the persistence adapter behind this read surface. */
export interface MatchParticipantReader {
  read(matchId: string, puuid: string): Promise<MatchParticipantInput | null>;
  readHistory(
    filters: MatchParticipantQuery,
    limit: number,
    after?: MatchParticipantCursor,
  ): Promise<MatchParticipantHistoryPage>;
}

export const MATCH_PARTICIPANT_READER = Symbol('MATCH_PARTICIPANT_READER');
