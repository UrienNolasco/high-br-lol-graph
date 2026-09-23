import { metricQuality } from '../../../core/metrics';
import { TimelineSnapshotProjection } from '../../../core/riot/timeline-snapshots';
import {
  classifyRegion,
  orientedRegion,
  Point,
  regionDefinition,
  MapRegionDefinition,
} from './map-region-definition';

export const MAP_PRESENCE_VERSION = 1;
export interface MapPresenceInput {
  matchId: string;
  gameVersion: string;
  mapId: number;
  gameDuration: number;
  participants: { puuid: string; teamId: number }[];
  projection: TimelineSnapshotProjection | null;
  processing: {
    status: string;
    completedAt: Date | null;
    processingVersion: number | null;
  } | null;
}
export interface PositionSample {
  frameIndex: number;
  timestampMs: number | null;
  participantId: number | null;
  position: Point | null;
  regionId: string | null;
  teamRelativeRegionId: string | null;
  origin: 'derived' | 'unavailable';
  reason: string | null;
}
function unavailable(
  frameIndex: number,
  timestampMs: number | null,
  participantId: number | null,
  reason: string,
  position: Point | null = null,
): PositionSample {
  return {
    frameIndex,
    timestampMs,
    participantId,
    position,
    regionId: null,
    teamRelativeRegionId: null,
    origin: 'unavailable',
    reason,
  };
}
function cadence(
  samples: Array<{ frameIndex: number; timestampMs: number | null }>,
) {
  const timestamps = samples
    .filter(
      (s): s is { frameIndex: number; timestampMs: number } =>
        s.timestampMs !== null,
    )
    .sort(
      (a, b) => a.timestampMs - b.timestampMs || a.frameIndex - b.frameIndex,
    );
  const intervals = timestamps.slice(1).map((sample, i) => ({
    fromFrameIndex: timestamps[i].frameIndex,
    toFrameIndex: sample.frameIndex,
    fromMs: timestamps[i].timestampMs,
    toMs: sample.timestampMs,
    elapsedMs: sample.timestampMs - timestamps[i].timestampMs,
  }));
  const positive = intervals
    .map((i) => i.elapsedMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  const firstMs = timestamps[0]?.timestampMs ?? null,
    lastMs = timestamps.at(-1)?.timestampMs ?? null;
  const span = firstMs !== null && lastMs !== null ? lastMs - firstMs : 0;
  const uniqueTimestampN = new Set(timestamps.map((s) => s.timestampMs)).size;
  const middle = Math.floor(positive.length / 2);
  return {
    sampleN: timestamps.length,
    uniqueTimestampN,
    firstMs,
    lastMs,
    frequencyHz: span > 0 ? ((uniqueTimestampN - 1) * 1000) / span : null,
    frequencyMethod:
      '(unique observed timestamps - 1) / observed timestamp span seconds; not residence duration',
    zeroIntervalN: intervals.filter((i) => i.elapsedMs === 0).length,
    positiveIntervalMs: {
      min: positive[0] ?? null,
      max: positive.at(-1) ?? null,
      median: positive.length
        ? positive.length % 2
          ? positive[middle]
          : (positive[middle - 1] + positive[middle]) / 2
        : null,
    },
    intervals,
  };
}
function distribution(
  samples: PositionSample[],
  definition: MapRegionDefinition | null,
  sideKnown: boolean,
  globalReason: string | null,
) {
  const valid = samples.filter((s) => s.reason === null && s.regionId !== null);
  const excludedReasons: Record<string, number> = {};
  for (const sample of samples)
    if (sample.reason)
      excludedReasons[sample.reason] =
        (excludedReasons[sample.reason] ?? 0) + 1;
  const summarize = (field: 'regionId' | 'teamRelativeRegionId') =>
    (definition?.regions ?? []).map((region) => {
      const selected = valid.filter((s) => s[field] === region.id);
      return {
        regionId: region.id,
        sampleCount: selected.length,
        fraction: valid.length ? selected.length / valid.length : null,
        denominator: {
          value: valid.length,
          unit: 'valid_position_samples',
          population:
            'positions with timestamp, participant and finite coordinates inside definition domain in this phase',
        },
        origin: valid.length ? ('derived' as const) : ('unavailable' as const),
        reason: globalReason ?? (valid.length ? null : 'zero_denominator'),
        frameIndices: selected.map((s) => s.frameIndex),
      };
    });
  return {
    quality: metricQuality(valid.length, samples.length),
    excludedReasons,
    absolute: summarize('regionId'),
    teamRelative: sideKnown ? summarize('teamRelativeRegionId') : null,
    teamRelativeReason: sideKnown ? null : 'unsupported_team',
    reason: globalReason ?? (valid.length ? null : 'zero_denominator'),
  };
}

/** Descriptive frequency of valid player snapshots, never ward locations or time occupancy. */
export function calculateMapPresence(input: MapPresenceInput, puuid: string) {
  const player = input.participants.find((p) => p.puuid === puuid);
  if (!player) throw new RangeError('Participant not found');
  const p = input.processing;
  const provenanceKnown =
    p?.status === 'COMPLETED' &&
    p.completedAt instanceof Date &&
    Number.isFinite(p.completedAt.getTime()) &&
    p.processingVersion !== null;
  const definition = regionDefinition(input.mapId, input.gameVersion);
  const reason = !provenanceKnown
    ? 'missing_processing_provenance'
    : p.processingVersion! < 2
      ? 'unsupported_version'
      : !definition
        ? 'unsupported_map_definition'
        : !input.projection
          ? 'missing_projection'
          : null;
  const projection = input.projection;
  const observedEnd = projection?.observedEndMs;
  const observedEndMs =
    typeof observedEnd === 'number' &&
    Number.isFinite(observedEnd) &&
    observedEnd >= 0
      ? observedEnd
      : null;
  const effectiveEndMs =
    observedEndMs ?? Math.max(0, input.gameDuration * 1000);
  const samples: PositionSample[] = (projection?.frames ?? []).map((frame) => {
    const timestampMs =
      typeof frame.timestamp === 'number' &&
      Number.isFinite(frame.timestamp) &&
      frame.timestamp >= 0
        ? frame.timestamp
        : null;
    const rows = Object.values(frame.participantFrames).filter(
      (row) => row.puuid === puuid,
    );
    const participantId = rows.length === 1 ? rows[0].participantId : null;
    if (reason)
      return unavailable(frame.frameIndex, timestampMs, participantId, reason);
    if (timestampMs === null)
      return unavailable(
        frame.frameIndex,
        null,
        participantId,
        'missing_timestamp',
      );
    if (timestampMs > effectiveEndMs)
      return unavailable(
        frame.frameIndex,
        timestampMs,
        participantId,
        'outside_observed_duration',
      );
    if (rows.length !== 1)
      return unavailable(
        frame.frameIndex,
        timestampMs,
        participantId,
        rows.length
          ? 'ambiguous_participant_frame'
          : 'missing_participant_frame',
      );
    const raw = rows[0].position;
    if (!raw || raw.x === null || raw.y === null)
      return unavailable(
        frame.frameIndex,
        timestampMs,
        participantId,
        'missing_position',
      );
    if (
      typeof raw.x !== 'number' ||
      typeof raw.y !== 'number' ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y)
    )
      return unavailable(
        frame.frameIndex,
        timestampMs,
        participantId,
        'invalid_position',
      );
    const position = { x: raw.x, y: raw.y },
      region = classifyRegion(position, definition!);
    if (!region)
      return unavailable(
        frame.frameIndex,
        timestampMs,
        participantId,
        'outside_definition_domain',
        position,
      );
    return {
      frameIndex: frame.frameIndex,
      timestampMs,
      participantId,
      position,
      regionId: region.id,
      teamRelativeRegionId: orientedRegion(region, player.teamId, definition!),
      origin: 'derived',
      reason: null,
    };
  });
  const withinDuration = samples.filter(
    (s) => s.timestampMs !== null && s.timestampMs <= effectiveEndMs,
  );
  const sideKnown = [100, 200].includes(player.teamId);
  const phaseDefinitions = [
    { id: 'early', startMs: 0, endMs: 600000, final: false },
    { id: 'middle', startMs: 600000, endMs: 1200000, final: false },
    {
      id: 'late',
      startMs: 1200000,
      endMs: Math.max(1200000, effectiveEndMs),
      final: true,
    },
  ];
  const phases = phaseDefinitions.map((phase) => {
    const effectivePhaseEnd = Math.min(phase.endMs, effectiveEndMs);
    const censored =
      effectiveEndMs < phase.endMs || effectiveEndMs < phase.startMs;
    const final = phase.final || effectiveEndMs < phase.endMs;
    const phaseSamples = withinDuration.filter(
      (s) =>
        s.timestampMs! >= phase.startMs &&
        (final
          ? s.timestampMs! <= effectivePhaseEnd
          : s.timestampMs! < effectivePhaseEnd),
    );
    return {
      id: phase.id,
      targetStartMs: phase.startMs,
      targetEndMs: phase.endMs,
      observedStartMs: Math.min(phase.startMs, effectiveEndMs),
      observedEndMs: effectivePhaseEnd,
      bounds: final ? ('[]' as const) : ('[)' as const),
      censored,
      ...distribution(phaseSamples, definition, sideKnown, reason),
      sampling: cadence(phaseSamples.filter((s) => !s.reason)),
    };
  });
  return {
    metricId: 'B08',
    metricVersion: MAP_PRESENCE_VERSION,
    matchId: input.matchId,
    puuid,
    mapId: input.mapId,
    gameVersion: input.gameVersion,
    teamId: player.teamId,
    processingVersion: provenanceKnown ? p.processingVersion : null,
    processedAt: provenanceKnown ? p.completedAt!.toISOString() : null,
    definition,
    observedEndMs,
    effectiveEndMs,
    endSource:
      observedEndMs !== null ? 'GAME_END' : 'Match.gameDuration_seconds',
    ...distribution(samples, definition, sideKnown, reason),
    phases,
    samples,
    sampling: {
      declaredFrameIntervalMs: projection?.frameIntervalMs ?? null,
      frames: cadence(reason ? [] : withinDuration),
      validPositions: cadence(withinDuration.filter((s) => !s.reason)),
      interpretation:
        'Equal weight per valid position snapshot. Fractions are not fractions of time; no interpolation between snapshots.',
    },
    evidence: {
      source: 'MatchTimelineProjection.frames.participantFrames.position',
      subjectKind: 'player',
      wardPositionsUsed: false,
      totalFrames: projection?.frames.length ?? 0,
      unassignedTimestampN: samples.filter((s) => s.timestampMs === null)
        .length,
      outsideDurationN: samples.filter(
        (s) => s.reason === 'outside_observed_duration',
      ).length,
    },
  };
}
export type MapPresenceReport = ReturnType<typeof calculateMapPresence>;
