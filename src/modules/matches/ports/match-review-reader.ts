import type { MatchReviewInput } from '../contracts/match-review';
export const MATCH_REVIEW_READER = Symbol('MATCH_REVIEW_READER');
export interface MatchReviewReader {
  findReview(matchId: string, puuid: string): Promise<MatchReviewInput | null>;
}
