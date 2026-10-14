import type {
  MatchReviewContext,
  MatchReviewInput,
  ReviewCombatWindow,
  ReviewEventReference,
  ReviewParticipant,
} from '../../contracts/match-review';
import { combatEventId, prepareCombat } from '../combat-calculator';

export const reviewRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const reviewNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function reviewFinalValue(
  participant: ReviewParticipant,
  field: string,
): unknown {
  const projection = reviewRecord(participant.finalStats);
  return projection.projectionVersion === 1
    ? reviewRecord(projection.values)[field]
    : null;
}

/** Observational match review, not cohort eligibility or a remake classifier. */
export function prepareMatchReview(
  input: MatchReviewInput,
): MatchReviewContext {
  const processing = input.processing;
  const known =
    processing?.status === 'COMPLETED' &&
    processing.completedAt instanceof Date &&
    Number.isFinite(processing.completedAt.getTime());
  const processedAt = known ? processing.completedAt!.toISOString() : null;
  const version = processing?.processingVersion ?? null;
  const roster = new Map(input.participants.map((p) => [p.puuid, p]));
  const sourceReason = !known
    ? 'missing_processing_provenance'
    : !Number.isSafeInteger(version) || version! < 2
      ? 'unsupported_version'
      : input.mapId !== 11 || ![420, 440].includes(input.queueId)
        ? 'outside_cohort'
        : roster.size !== 10 ||
            input.participants.length !== 10 ||
            [100, 200].some(
              (team) =>
                input.participants.filter((p) => p.teamId === team).length !==
                5,
            )
          ? 'invalid_roster'
          : null;
  const rawFrames = input.projection?.frames ?? [];
  const validFrameShape = (frame: unknown) => {
    const value = reviewRecord(frame),
      participants = value.participantFrames;
    return (
      frame !== null &&
      typeof frame === 'object' &&
      participants !== null &&
      typeof participants === 'object' &&
      !Array.isArray(participants)
    );
  };
  const malformedFrames =
    !Array.isArray(rawFrames) ||
    rawFrames.some((frame) => !validFrameShape(frame));
  const frames = Array.isArray(rawFrames)
    ? rawFrames.filter(validFrameShape)
    : [];
  const participantIds = new Map<number, string>();
  const reverseIds = new Map<string, number>();
  let invalidIdentity = false;
  for (const frame of frames) {
    for (const p of Object.values(frame.participantFrames)) {
      if (
        !p ||
        !Number.isSafeInteger(p.participantId) ||
        p.participantId < 1 ||
        !p.puuid ||
        !roster.has(p.puuid)
      ) {
        invalidIdentity = true;
        continue;
      }
      if (
        (participantIds.has(p.participantId) &&
          participantIds.get(p.participantId) !== p.puuid) ||
        (reverseIds.has(p.puuid) && reverseIds.get(p.puuid) !== p.participantId)
      )
        invalidIdentity = true;
      participantIds.set(p.participantId, p.puuid);
      reverseIds.set(p.puuid, p.participantId);
    }
  }
  const snapshotReason =
    sourceReason ??
    (malformedFrames
      ? 'invalid_snapshot_shape'
      : input.readLimits?.framesTruncated
        ? 'truncated_frames'
        : !input.projection
          ? 'missing_projection'
          : input.projection.projectionVersion !== 1
            ? 'unsupported_snapshot_version'
            : frames.length < 2
              ? 'insufficient_frames'
              : invalidIdentity
                ? 'conflicting_participant_identity'
                : frames.some(
                      (f, i) =>
                        !reviewNumber(f.timestamp) ||
                        !Number.isSafeInteger(f.frameIndex) ||
                        f.frameIndex < 0 ||
                        (i > 0 &&
                          (f.timestamp <= frames[i - 1].timestamp! ||
                            f.frameIndex <= frames[i - 1].frameIndex)),
                    )
                  ? 'invalid_frame_order'
                  : null);
  const combat = prepareCombat({
    matchId: input.matchId,
    gameDuration: input.gameDuration,
    participants: input.participants,
    events: input.events,
    processingVersion: version ?? 0,
    projectionComplete: !sourceReason && !input.readLimits?.eventsTruncated,
    processedAt: processedAt ?? '',
  });
  const ends = combat.events.filter((e) => e.type === 'GAME_END');
  const endMs =
    ends.length === 1 && reviewNumber(ends[0].timestampMs)
      ? ends[0].timestampMs
      : null;
  const conflictingIdentity = (
    participantId: number | null | undefined,
    puuid: string | null,
  ) =>
    (participantId != null &&
      participantIds.has(participantId) &&
      participantIds.get(participantId) !== puuid) ||
    (puuid !== null &&
      reverseIds.has(puuid) &&
      reverseIds.get(puuid) !== participantId);
  const eventIdentityInvalid =
    combat.kills.some((k) => {
      const e = k.event;
      return (
        conflictingIdentity(e.actorParticipantId, e.actorPuuid) ||
        (!!e.actorPuuid && e.actorParticipantId === null) ||
        (k.actor && k.victim && k.actor.teamId === k.victim.teamId)
      );
    }) ||
    input.events.some(
      (e) =>
        e.type === 'CHAMPION_KILL' &&
        conflictingIdentity(e.victimParticipantId, e.victimPuuid),
    );
  const combatReason =
    sourceReason ??
    (input.readLimits?.eventsTruncated
      ? 'truncated_events'
      : !combat.available
        ? (combat.reason ?? 'missing_projection')
        : endMs === null
          ? 'missing_or_ambiguous_game_end'
          : input.projection?.observedEndMs != null &&
              input.projection.observedEndMs !== endMs
            ? 'conflicting_observed_end'
            : invalidIdentity || eventIdentityInvalid
              ? 'conflicting_participant_identity'
              : input.participants.some(
                    (p) =>
                      !Number.isSafeInteger(p.kills) ||
                      p.kills! < 0 ||
                      !Number.isSafeInteger(p.deaths) ||
                      p.deaths! < 0,
                  )
                ? 'missing_final_combat_counts'
                : combat.missingKillEvents
                  ? 'kill_death_summary_mismatch'
                  : combat.kills.some(
                        (k) =>
                          !reviewNumber(k.event.timestampMs) ||
                          k.event.timestampMs > endMs ||
                          !k.victim ||
                          (!k.actor && !k.environmental),
                      )
                    ? 'invalid_kill_event'
                    : null);
  const kills = combat.kills
    .filter((k) => reviewNumber(k.event.timestampMs) && k.victim)
    .map((k) => {
      const ids = k.event.assistingParticipantIds;
      const names = k.event.assistingPuuids;
      const validPairs =
        Array.isArray(ids) && Array.isArray(names)
          ? ids.map(
              (id, i) =>
                typeof id === 'number' &&
                Number.isSafeInteger(id) &&
                id > 0 &&
                typeof names[i] === 'string' &&
                participantIds.get(id) === names[i] &&
                reverseIds.get(names[i]) === id,
            )
          : [];
      const identityKnown =
        Array.isArray(ids) &&
        Array.isArray(names) &&
        ids.length === names.length &&
        validPairs.every(Boolean);
      const knownAssistants = Array.isArray(names)
        ? k.assistants.filter((puuid) =>
            names.some((name, i) => name === puuid && validPairs[i]),
          )
        : [];
      return {
        eventId: combatEventId(k.event),
        timestampMs: k.event.timestampMs!,
        frameIndex: k.event.frameIndex,
        eventIndex: k.event.eventIndex,
        killerPuuid: k.actor?.puuid ?? null,
        victimPuuid: k.victim!.puuid,
        assistingPuuids: knownAssistants,
        assistanceComplete: k.assistanceComplete && identityKnown,
        payload: reviewRecord(k.event.payload),
      };
    })
    .sort(
      (a, b) =>
        a.timestampMs - b.timestampMs ||
        a.frameIndex - b.frameIndex ||
        a.eventIndex - b.eventIndex,
    );
  return {
    input,
    sourceReason,
    snapshotReason,
    combatReason,
    processedAt,
    processingVersion: version,
    endMs: sourceReason || !combat.available ? null : endMs,
    frames,
    kills: sourceReason || !combat.available ? [] : kills,
    participantIds,
  };
}

export function reviewCombatWindow(
  context: MatchReviewContext,
  puuid: string,
  startMs: number,
  endMs: number,
): ReviewCombatWindow {
  const team = context.input.participants.find(
    (p) => p.puuid === puuid,
  )?.teamId;
  const events = context.kills.filter(
    (k) => k.timestampMs > startMs && k.timestampMs <= endMs,
  );
  const relevant = events.filter(
    (k) =>
      k.killerPuuid === puuid ||
      k.victimPuuid === puuid ||
      k.assistingPuuids.includes(puuid),
  );
  const unknown = events.filter(
    (k) =>
      k.killerPuuid !== puuid &&
      !k.assistanceComplete &&
      !k.assistingPuuids.includes(puuid) &&
      context.input.participants.find((p) => p.puuid === k.victimPuuid)
        ?.teamId !== team,
  );
  const recordedAssists = events.filter((k) =>
    k.assistingPuuids.includes(puuid),
  ).length;
  return {
    startMs,
    endMs,
    bounds: '(]',
    kills: events.filter((k) => k.killerPuuid === puuid).length,
    deaths: events.filter((k) => k.victimPuuid === puuid).length,
    recordedAssists,
    assists: context.combatReason || unknown.length ? null : recordedAssists,
    reason:
      context.combatReason ?? (unknown.length ? 'unknown_assistance' : null),
    events: relevant.map(
      (k): ReviewEventReference => ({
        eventId: k.eventId,
        timestampMs: k.timestampMs,
        killerPuuid: k.killerPuuid,
        victimPuuid: k.victimPuuid,
      }),
    ),
    unknownAssistEventIds: unknown.map((k) => k.eventId),
  };
}
