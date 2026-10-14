import { matchReviewFixture } from '../../../../../test/fixtures/match-review.fixture';
import { prepareMatchReview, reviewCombatWindow } from './review-context';

describe('match review input integrity', () => {
  it('keeps persisted provenance and separates literal review from cohort remake semantics', () => {
    const input = matchReviewFixture(),
      c = prepareMatchReview(input);
    expect(c).toMatchObject({
      sourceReason: null,
      snapshotReason: null,
      combatReason: null,
      processedAt: '2026-10-01T00:00:00.000Z',
      endMs: 660000,
    });
    expect(c.participantIds.get(1)).toBe('review-p1');
  });
  it('does not invent processing metadata or accept failed generations', () => {
    const i = matchReviewFixture();
    i.processing!.status = 'FAILED';
    expect(prepareMatchReview(i)).toMatchObject({
      sourceReason: 'missing_processing_provenance',
      processedAt: null,
    });
  });
  it('rejects conflicting event generations', () => {
    const i = matchReviewFixture();
    i.events[0].processingVersion = 3;
    expect(prepareMatchReview(i).combatReason).toBe('unsupported_version');
  });
  it('deduplicates identical source IDs but rejects their conflicting values', () => {
    const i = matchReviewFixture();
    i.events.push(structuredClone(i.events[0]));
    expect(prepareMatchReview(i).kills).toHaveLength(2);
    i.events.at(-1)!.timestampMs = 195001;
    expect(prepareMatchReview(i).combatReason).toBe('invalid_value');
  });
  it('rejects changed participant ID to PUUID mapping across frames', () => {
    const i = matchReviewFixture();
    i.projection!.frames[1].participantFrames['1'].puuid = 'review-p2';
    expect(prepareMatchReview(i).snapshotReason).toBe(
      'conflicting_participant_identity',
    );
  });
  it('checks event participant identity against explicit snapshot identity', () => {
    const i = matchReviewFixture();
    i.events[0].actorParticipantId = 7;
    expect(prepareMatchReview(i).combatReason).toBe(
      'conflicting_participant_identity',
    );
  });
  it('does not treat absent assistants as known zero', () => {
    const i = matchReviewFixture();
    i.events[0].assistingParticipantIds = null;
    i.events[0].assistingPuuids = null;
    const c = prepareMatchReview(i),
      w = reviewCombatWindow(c, 'review-p7', 180000, 360000);
    expect(w).toMatchObject({
      assists: null,
      recordedAssists: 0,
      reason: 'unknown_assistance',
    });
    expect(w.unknownAssistEventIds).toEqual(['REVIEW_TEST:4:0']);
    expect(reviewCombatWindow(c, 'review-p6', 180000, 360000).assists).toBe(0);
  });
  it('requires unique observed end instead of duration fallback', () => {
    const i = matchReviewFixture();
    i.events = i.events.filter((e) => e.type !== 'GAME_END');
    expect(prepareMatchReview(i)).toMatchObject({
      endMs: null,
      combatReason: 'missing_or_ambiguous_game_end',
    });
  });
  it('detects truncated event/frame reads independently', () => {
    const i = matchReviewFixture();
    i.readLimits = { eventsTruncated: true, framesTruncated: false };
    expect(prepareMatchReview(i)).toMatchObject({
      combatReason: 'truncated_events',
      snapshotReason: null,
    });
    i.readLimits = { eventsTruncated: false, framesTruncated: true };
    expect(prepareMatchReview(i)).toMatchObject({
      combatReason: null,
      snapshotReason: 'truncated_frames',
    });
  });
  it('reconciles kills/deaths and rejects null final counts', () => {
    const i = matchReviewFixture();
    i.participants[0].deaths = 1;
    expect(prepareMatchReview(i).combatReason).toBe(
      'kill_death_summary_mismatch',
    );
    i.participants[0].deaths = null;
    expect(prepareMatchReview(i).combatReason).toBe(
      'missing_final_combat_counts',
    );
  });
  it('detects known identity conflicts even if one unrelated snapshot participant is missing', () => {
    const i = matchReviewFixture();
    for (const f of i.projection!.frames) delete f.participantFrames['10'];
    i.events[0].actorParticipantId = 7;
    expect(prepareMatchReview(i).combatReason).toBe(
      'conflicting_participant_identity',
    );
  });
  it('returns unavailable for malformed persisted frames instead of throwing', () => {
    const i = matchReviewFixture();
    i.projection!.frames[0] = null as unknown as NonNullable<
      typeof i.projection
    >['frames'][number];
    expect(prepareMatchReview(i).snapshotReason).toBe('invalid_snapshot_shape');
  });
  it('does not expose event IDs or timestamps from a rejected processing generation', () => {
    const i = matchReviewFixture();
    i.processing!.status = 'FAILED';
    expect(prepareMatchReview(i)).toMatchObject({ kills: [], endMs: null });
    i.processing!.status = 'COMPLETED';
    i.events[0].processingVersion = 3;
    expect(prepareMatchReview(i)).toMatchObject({ kills: [], endMs: null });
  });
});
