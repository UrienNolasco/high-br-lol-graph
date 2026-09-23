import { metricQuality } from '../../../core/metrics';
import { INDICATOR_VERSION, INDICATOR_LIMITATIONS } from './indicator-catalog';
import { calculateIndicators, IndicatorReport } from './indicator-calculator';
import {
  IndicatorInput,
  IndicatorOptions,
  provenance,
  matchIndicatorHref,
} from './indicator.types';
export function summarizeIndicatorHistory(
  inputs: IndicatorInput[],
  options: IndicatorOptions,
) {
  const seen = new Set<string>(),
    rows: { input: IndicatorInput; report: IndicatorReport }[] = [];
  for (const input of inputs) {
    const identity = JSON.stringify([
      input.match.matchId,
      input.participant.puuid,
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    rows.push({ input, report: calculateIndicators(input, options.family) });
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const r = row.report,
      key = JSON.stringify([
        r.participant.championId,
        r.participant.role,
        r.context.patch,
        r.context.gameVersion,
        r.context.queueId,
        r.context.mapId,
        row.input.processing?.processingVersion ?? null,
        r.catalogValidation.status,
      ]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const summaries = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, members]) => {
      const first = members[0].report,
        totalMatches = new Set(members.map((r) => r.input.match.matchId)).size,
        players = new Set(members.map((r) => r.input.participant.puuid)).size;
      const cohortReason = !first.participant.role
        ? 'ambiguous_role'
        : !first.context.patch
          ? 'unsupported_version'
          : null;
      const metrics = first.metrics.map((definition) => {
        const observations = members.map((row) => ({
          row,
          metric: row.report.metrics.find((m) => m.id === definition.id)!,
        }));
        const valid = observations.filter(
          (o) =>
            !cohortReason &&
            provenance(o.row.input).known &&
            o.metric.count.value !== null,
        );
        const validRate = observations.filter(
          (o) => !cohortReason && o.metric.perMinute?.value != null,
        );
        const sum = valid.reduce((n, o) => n + o.metric.count.value!, 0),
          rateSum = validRate.reduce((n, o) => n + o.metric.count.value!, 0),
          minutes = validRate.reduce(
            (n, o) => n + o.metric.perMinute!.denominator.value!,
            0,
          );
        const evidence = valid.slice(0, options.evidenceLimit).map((o) => ({
          matchId: o.row.input.match.matchId,
          puuid: o.row.input.participant.puuid,
          value: o.metric.count.value,
          minutes: o.metric.perMinute?.denominator.value ?? null,
          processingVersion: o.row.report.provenance.processingVersion,
          processedAt: o.row.report.provenance.processedAt,
          href: `${matchIndicatorHref(o.row.input)}?family=${definition.family}`,
        }));
        const missingReasons: Record<string, number> = {};
        for (const o of observations) {
          const reason =
            cohortReason ??
            o.row.report.provenance.reason ??
            o.metric.count.reason;
          if (reason)
            missingReasons[reason] = (missingReasons[reason] ?? 0) + 1;
        }
        const rateMissingReasons: Record<string, number> = {};
        if (definition.perMinute)
          for (const o of observations) {
            const reason = cohortReason ?? o.metric.perMinute?.reason;
            if (reason)
              rateMissingReasons[reason] =
                (rateMissingReasons[reason] ?? 0) + 1;
          }
        const countReason = valid.length
          ? null
          : (cohortReason ?? 'no_valid_observations');
        return {
          id: definition.id,
          name: definition.name,
          metricId: definition.count.metricId,
          metricVersion: INDICATOR_VERSION,
          temporalScope: 'final_summary_retrospective',
          count: {
            value: valid.length ? sum / valid.length : null,
            unit: 'count',
            origin: valid.length ? 'derived' : 'unavailable',
            reason: countReason,
            sum: valid.length ? sum : null,
            method:
              'sum of available counters / distinct valid match-player observations',
            denominator: {
              value: valid.length,
              unit: 'match_player_observations',
            },
            quality: metricQuality(valid.length, observations.length),
            validMatches: new Set(valid.map((o) => o.row.input.match.matchId))
              .size,
            validPlayers: new Set(
              valid.map((o) => o.row.input.participant.puuid),
            ).size,
            missingReasons,
          },
          perMinute: definition.perMinute
            ? {
                value: minutes > 0 ? rateSum / minutes : null,
                unit: 'count_per_minute',
                origin: minutes > 0 ? 'derived' : 'unavailable',
                reason:
                  minutes > 0
                    ? null
                    : (cohortReason ?? 'no_valid_duration_pairs'),
                sumCounters: validRate.length ? rateSum : null,
                denominator: {
                  value: minutes || null,
                  unit: 'minutes',
                  population:
                    'timePlayed minutes only from observations with both valid counter and duration',
                },
                method:
                  'ratio of sums over the same valid counter-duration pairs; not mean of per-match rates',
                quality: metricQuality(validRate.length, observations.length),
                missingReasons: rateMissingReasons,
              }
            : null,
          evidence: {
            items: evidence,
            total: valid.length,
            limit: options.evidenceLimit,
            hasMore: valid.length > evidence.length,
            source:
              'All selected match-player observations remain accessible through group.matches links',
          },
        };
      });
      const processed = members
        .flatMap((row) =>
          row.report.provenance.processedAt
            ? [row.report.provenance.processedAt]
            : [],
        )
        .sort();
      return {
        id: Buffer.from(key).toString('base64url'),
        cohort: {
          championId: first.participant.championId,
          role: first.participant.role,
          patch: first.context.patch,
          gameVersion: first.context.gameVersion,
          queueId: first.context.queueId,
          mapId: first.context.mapId,
          processingVersion:
            members[0].input.processing?.processingVersion ?? null,
        },
        catalogValidation: first.catalogValidation,
        provenance: {
          processingVersion: first.provenance.processingVersion,
          processedAt:
            members.every((r) => r.report.provenance.known) &&
            new Set(processed).size === 1
              ? processed[0]
              : null,
          processedAtRange: processed.length
            ? {
                minimum: processed[0],
                maximum: processed[processed.length - 1],
              }
            : null,
          reason: members.every((r) => r.report.provenance.known)
            ? new Set(processed).size === 1
              ? null
              : 'aggregate_has_multiple_source_publications'
            : 'some_processing_metadata_unavailable',
        },
        sample: {
          observations: members.length,
          distinctMatches: totalMatches,
          distinctPlayers: players,
        },
        metrics,
        matches: members.map((r) => ({
          matchId: r.input.match.matchId,
          puuid: r.input.participant.puuid,
          gameCreation: r.input.match.gameCreation.toString(),
          href: matchIndicatorHref(r.input),
        })),
        reference: {
          percentile: null,
          reason: 'not_calculated',
          interpretation:
            'Descriptive selected-player history within this exact cohort; no population benchmark or performance ranking',
        },
      };
    });
  return {
    catalogVersion: INDICATOR_VERSION,
    temporalScope: 'final_summary_retrospective',
    sample: {
      observations: rows.length,
      distinctMatches: new Set(rows.map((r) => r.input.match.matchId)).size,
      distinctPlayers: new Set(rows.map((r) => r.input.participant.puuid)).size,
      duplicateObservationsIgnored: inputs.length - rows.length,
    },
    groups: {
      items: summaries.slice(
        options.groupOffset,
        options.groupOffset + options.groupLimit,
      ),
      total: summaries.length,
      offset: options.groupOffset,
      limit: options.groupLimit,
      hasMore: options.groupOffset + options.groupLimit < summaries.length,
    },
    limitations: INDICATOR_LIMITATIONS,
  };
}
