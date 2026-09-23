import {
  gameVersionPatch,
  normalizeRole,
  metricQuality,
} from '../../../core/metrics';
import {
  INDICATOR_CATALOG,
  INDICATOR_LIMITATIONS,
  INDICATOR_VERSION,
  IndicatorDefinition,
  IndicatorFamily,
} from './indicator-catalog';
import {
  IndicatorInput,
  object,
  provenance,
  matchIndicatorHref,
} from './indicator.types';
function read(input: IndicatorInput, d: IndicatorDefinition) {
  const projection = object(input.participant.finalStats),
    container =
      d.source === 'finalStats'
        ? object(projection.values)
        : object(input.participant[d.source]);
  const raw = container[d.field];
  const reason =
    d.source === 'finalStats' && projection.projectionVersion !== 1
      ? input.participant.finalStats == null
        ? 'missing_projection'
        : 'unsupported_version'
      : raw == null
        ? object(projection.missingReasons)[d.field] === 'invalid_value' &&
          d.source === 'finalStats'
          ? 'invalid_value'
          : 'missing_field'
        : typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0
          ? 'invalid_value'
          : null;
  return { value: reason ? null : (raw as number), reason };
}
export function calculateIndicators(
  input: IndicatorInput,
  family?: IndicatorFamily,
) {
  const source = provenance(input),
    patch = gameVersionPatch(input.match.gameVersion),
    stats = object(input.participant.finalStats),
    rawDuration = object(stats.values).timePlayed;
  const durationReason =
    stats.projectionVersion !== 1
      ? input.participant.finalStats == null
        ? 'missing_projection'
        : 'unsupported_version'
      : rawDuration == null
        ? object(stats.missingReasons).timePlayed === 'invalid_value'
          ? 'invalid_value'
          : 'missing_field'
        : typeof rawDuration !== 'number' ||
            !Number.isSafeInteger(rawDuration) ||
            rawDuration < 0
          ? 'invalid_value'
          : rawDuration === 0
            ? 'zero_denominator'
            : null;
  const seconds =
    typeof rawDuration === 'number' &&
    Number.isSafeInteger(rawDuration) &&
    rawDuration >= 0 &&
    stats.projectionVersion === 1
      ? rawDuration
      : null;
  const duration = {
    value: seconds,
    unit: 'seconds',
    field: 'finalStats.values.timePlayed',
    reason: durationReason,
  };
  const selected = INDICATOR_CATALOG.filter(
    (d) => !family || d.family === family,
  );
  const metrics = selected.map((d) => {
    const observed = read(input, d),
      field =
        d.source === 'finalStats'
          ? `finalStats.values.${d.field}`
          : `${d.source}.${d.field}`;
    const evidence = [
      {
        source: 'MatchParticipant',
        field,
        value: observed.value,
        matchId: input.match.matchId,
        puuid: input.participant.puuid,
        href: `${matchIndicatorHref(input)}?family=${d.family}`,
      },
    ];
    const base = {
      metricId: d.metricId,
      metricVersion: INDICATOR_VERSION,
      processingVersion: source.processingVersion,
      processedAt: source.processedAt,
      matchId: input.match.matchId,
      subject: { kind: 'participant', id: input.participant.puuid },
      window: null,
      temporalScope: 'final_summary_retrospective',
      evidence,
    };
    const count = {
      ...base,
      value: observed.value,
      unit: 'count',
      origin: observed.reason ? 'unavailable' : 'observed',
      reason: observed.reason,
      method:
        'Literal optional counter persisted from final Match-V5 summary; unknown is not zero',
      denominator: null,
      quality: metricQuality(observed.value === null ? 0 : 1, 1),
    };
    const rateReason = source.reason ?? observed.reason ?? durationReason;
    const perMinute = d.perMinute
      ? {
          ...base,
          value: rateReason ? null : observed.value! / (seconds! / 60),
          unit: 'count_per_minute',
          origin: rateReason ? 'unavailable' : 'derived',
          reason: rateReason,
          method: 'counter / (participant timePlayed seconds / 60)',
          denominator: {
            value: seconds === null ? null : seconds / 60,
            unit: 'minutes',
            population:
              'Persisted participant finalStats.timePlayed; no timeline timestamps inferred',
          },
          quality: metricQuality(rateReason ? 0 : 1, 1),
          evidence: [
            ...evidence,
            {
              source: 'MatchParticipant',
              field: 'finalStats.values.timePlayed',
              value: seconds,
              matchId: input.match.matchId,
              puuid: input.participant.puuid,
              href: matchIndicatorHref(input),
            },
          ],
        }
      : null;
    return { id: d.id, name: d.name, family: d.family, count, perMinute };
  });
  const unknownFields = Object.fromEntries(
    (['challenges', 'pings'] as const).map((name) => {
      const known = new Set(
          INDICATOR_CATALOG.filter((d) => d.source === name).map(
            (d) => d.field,
          ),
        ),
        all = Object.keys(object(input.participant[name]))
          .filter((k) => !known.has(k))
          .sort();
      return [
        name,
        {
          total: all.length,
          fields: all.slice(0, 20),
          truncated: all.length > 20,
          reason: all.length ? 'outside_validated_indicator_catalog' : null,
          meaning: 'Uncatalogued here; not necessarily an invalid Riot field',
        },
      ];
    }),
  );
  return {
    catalogVersion: INDICATOR_VERSION,
    matchId: input.match.matchId,
    participant: {
      puuid: input.participant.puuid,
      championId: input.participant.championId,
      championName: input.participant.championName,
      role: normalizeRole(input.participant.role),
    },
    context: {
      gameVersion: input.match.gameVersion,
      patch,
      queueId: input.match.queueId,
      mapId: input.match.mapId,
      gameCreation: input.match.gameCreation.toString(),
      gameDurationSeconds: input.match.gameDuration,
      temporalScope: 'final_summary_retrospective',
    },
    provenance: source,
    catalogValidation: {
      status: patch === '16.2' ? 'fixture_validated' : 'unvalidated_patch',
      reason:
        patch === '16.2'
          ? null
          : patch
            ? 'patch_not_in_validation_corpus'
            : 'unsupported_version',
      validatedFixturePatches: ['16.2'],
      meaning:
        'Unknown patch preserves literal known-field observations; does not claim validated cross-version semantics',
    },
    duration,
    metrics,
    coverage: {
      validCounters: metrics.filter((m) => m.count.value !== null).length,
      totalCounters: metrics.length,
      validRates: metrics.filter((m) => m.perMinute?.value != null).length,
      totalRates: metrics.filter((m) => m.perMinute !== null).length,
    },
    unknownFields,
    limitations: INDICATOR_LIMITATIONS,
  };
}
export type IndicatorReport = ReturnType<typeof calculateIndicators>;
