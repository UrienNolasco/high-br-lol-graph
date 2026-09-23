import {
  MetricEvidence,
  MissingReason,
  metricContext,
  metricQuality,
  metricValue,
  ratioMetric,
  unavailableMetric,
} from '../../../core/metrics';
import { readSnapshotProjection } from '../../../core/riot/timeline-snapshots';
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const nonnegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export interface EpisodeResourceContext {
  matchId: string;
  processedAt: string;
  processingVersion: number;
  episodeId: string;
  startMs: number;
  maxAgeMs: number;
}
/** Select a global frame strictly earlier than episode start, never an equal-time/post-event frame or a per-field backfill. */
export function episodeResources(
  projectionValue: unknown,
  puuids: readonly string[],
  context: EpisodeResourceContext,
) {
  const projection = readSnapshotProjection(projectionValue);
  const shape = record(projectionValue);
  let reason: MissingReason | null =
    projectionValue == null
      ? 'missing_projection'
      : !projection
        ? shape.projectionVersion === 1
          ? 'invalid_value'
          : 'unsupported_version'
        : null;
  const frames = (projection?.frames ?? []).filter(
    (f) =>
      f &&
      nonnegative(f.timestamp) &&
      Number.isSafeInteger(f.frameIndex) &&
      f.frameIndex >= 0,
  );
  if (new Set(frames.map((f) => f.frameIndex)).size !== frames.length)
    reason = 'invalid_value';
  const previous = reason
    ? null
    : (frames
        .filter((f) => f.timestamp! < context.startMs)
        .sort(
          (a, b) => b.timestamp! - a.timestamp! || b.frameIndex - a.frameIndex,
        )[0] ?? null);
  const ageMs = previous ? context.startMs - previous.timestamp! : null;
  if (!reason && !previous) reason = 'missing_frame';
  const stale = ageMs !== null && ageMs > context.maxAgeMs;
  const snapshotReason = reason ?? (stale ? 'missing_frame' : null);
  const participants = [...new Set(puuids)].sort().map((puuid) => {
    const candidates = Object.values(
      record(previous?.participantFrames),
    ).filter((p) => record(p).puuid === puuid);
    const p = candidates.length === 1 ? record(candidates[0]) : null;
    const participantReason: MissingReason | null =
      snapshotReason ??
      (candidates.length > 1 ? 'invalid_value' : !p ? 'missing_frame' : null);
    const evidence = (field: string): MetricEvidence => ({
      source: 'MatchTimelineProjection.frames',
      field: `participantFrames.${puuid}.${field}`,
      value: nonnegative(p?.[field]) ? (p![field] as number) : null,
      ...(previous
        ? { frameIndex: previous.frameIndex, timestampMs: previous.timestamp! }
        : {}),
    });
    const ctx = (unit: 'gold' | 'percent', fields: string[]) =>
      metricContext({
        metricId: 'E06',
        processingVersion: context.processingVersion,
        processedAt: context.processedAt,
        matchId: context.matchId,
        subject: { kind: 'participant', id: puuid },
        unit,
        window: previous
          ? {
              startMs: previous.timestamp!,
              endMs: previous.timestamp!,
              bounds: '[]',
            }
          : null,
        denominator: null,
        evidence: fields.map(evidence),
        quality: metricQuality(
          participantReason
            ? 0
            : fields.filter((f) => nonnegative(p?.[f])).length,
          fields.length,
        ),
      });
    const fieldReason = (field: string): MissingReason | null =>
      participantReason ??
      (p?.[field] == null
        ? 'missing_field'
        : !nonnegative(p[field])
          ? 'invalid_value'
          : null);
    const literal = (field: string) => {
      const c = ctx('gold', [field]),
        r = fieldReason(field);
      return r
        ? unavailableMetric(
            c,
            r,
            'strictly previous snapshot; absent/stale snapshot is not zero',
          )
        : metricValue(
            c,
            p![field] as number,
            'observed',
            `literal ${field} at the explicitly dated previous frame, not an exact value at episode start`,
          );
    };
    const currentGold = literal('currentGold'),
      totalGold = literal('totalGold');
    const proxyCtx = ctx('gold', ['currentGold']);
    const unspentGoldProxy = currentGold.reason
      ? unavailableMetric(
          proxyCtx,
          currentGold.reason,
          'last strictly previous currentGold used as an approximate pre-episode resource; no future read',
        )
      : metricValue(
          proxyCtx,
          currentGold.value,
          'estimated',
          'last strictly previous currentGold used as an approximate pre-episode resource; age and staleness threshold are explicit',
        );
    const shareCtx = ctx('percent', ['currentGold', 'totalGold']);
    shareCtx.denominator = {
      value: totalGold.value,
      unit: 'gold',
      population:
        'this participant totalGold in the same strictly previous snapshot',
    };
    const unspentShare =
      currentGold.reason || totalGold.reason
        ? unavailableMetric(shareCtx, currentGold.reason ?? totalGold.reason!)
        : ratioMetric(shareCtx, currentGold.value, totalGold.value, 100);
    return {
      puuid,
      reason: participantReason,
      currentGold,
      totalGold,
      unspentGoldProxy,
      unspentShare,
    };
  });
  return {
    episodeId: context.episodeId,
    selection:
      'latest timestamp strictly less than episode start; greatest frameIndex breaks equal timestamp ties',
    snapshotFrameIndex: previous?.frameIndex ?? null,
    snapshotTimestampMs: previous?.timestamp ?? null,
    ageMs,
    maxAgeMs: context.maxAgeMs,
    stale,
    reason: snapshotReason,
    participants,
  };
}
