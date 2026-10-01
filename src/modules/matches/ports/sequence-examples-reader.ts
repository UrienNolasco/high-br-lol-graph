export interface PersonalMatchContext {
  playerId: string;
  championId: number;
  role: string;
  queueId: number;
  mapId: number;
  patch?: string;
  fromMs: number;
  toMs: number;
}
export interface SequenceExampleRequest {
  matchId: string;
  subjectId: string;
  processingVersion: number;
  processedAt: string;
  eventLimit: number;
  episodeLimit: number;
}
export interface SequenceExample {
  matchId: string;
  reason: string | null;
  episodes: unknown[];
  totalEpisodes: number;
  truncated: boolean;
}
export interface SequenceExamplesReader {
  countUnpublished(
    context: PersonalMatchContext,
    publishedMatchIds: readonly string[],
  ): Promise<number>;
  readExample(request: SequenceExampleRequest): Promise<SequenceExample>;
}
export const SEQUENCE_EXAMPLES_READER = Symbol('SEQUENCE_EXAMPLES_READER');
