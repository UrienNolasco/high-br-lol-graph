import {
  MATCH_REVIEW_VERSION,
  type MatchReviewInput,
} from '../../contracts/match-review';
import { prepareMatchReview } from './review-context';
import { calculateDeathResourceReview } from './death-resource-review';
import { calculateDamageReview } from './damage-review';
import { calculateDeathRecapReview } from './death-recap-review';

export function calculateMatchReview(input: MatchReviewInput, puuid: string) {
  if (!input.participants.some((p) => p.puuid === puuid))
    throw new RangeError('Participant not found');
  const context = prepareMatchReview(input);
  const participant = input.participants.find((p) => p.puuid === puuid)!;
  return {
    matchId: input.matchId,
    puuid,
    participant: {
      puuid,
      championName: participant.championName,
      teamId: participant.teamId,
      role: participant.role,
    },
    metricVersion: MATCH_REVIEW_VERSION,
    processingVersion: context.processingVersion,
    processedAt: context.processedAt,
    source:
      'MatchTimelineProjection + MatchEventProjection + MatchParticipant.finalStats',
    temporalScope: 'retrospective_match_review' as const,
    reason: context.sourceReason,
    coverage: {
      snapshots: context.snapshotReason,
      combat: context.combatReason,
      observedEndMs: context.endMs,
      readLimits: input.readLimits ?? {
        eventsTruncated: false,
        framesTruncated: false,
      },
    },
    interpretation: [
      'Observed changes around an event do not estimate its causal cost or the quality of a decision.',
      'Snapshot boundaries do not identify fights, targets, routes or damage conversion.',
      'Rankings and final-total fractions are retrospective; display original observation timestamps.',
      'Literal review does not classify remakes or override eligibility of other metric families.',
    ],
    resources: calculateDeathResourceReview(context, puuid),
    damage: calculateDamageReview(context, puuid),
    recaps: calculateDeathRecapReview(context, puuid),
  };
}
export type MatchReview = ReturnType<typeof calculateMatchReview>;
