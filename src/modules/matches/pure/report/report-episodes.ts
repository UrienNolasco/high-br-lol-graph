import { metricQuality } from '../../../../core/metrics';
import {
  ReportInput,
  ReportOptions,
  record,
  isFiniteNumber,
  sourceKnown,
  sourceTime,
} from './report.types';
import { ReportFamilyData } from './report-families';
import {
  reportMetric,
  page,
  withinOutput,
  reportBase,
} from './report-navigation';
export interface ReportEpisode {
  id: string;
  kind: 'death' | 'kill' | 'objective';
  timestampMs: number | null;
  title: string;
  interpretation: string;
  window: unknown;
  occurrence: Record<string, unknown>;
  associatedCaptures: Record<string, unknown> | null;
  eventIds: string[];
}
export function buildReportEpisodes(
  input: ReportInput,
  puuid: string,
  sequences: ReportFamilyData,
  objectives: ReportFamilyData,
): ReportEpisode[] {
  const episodes: ReportEpisode[] = [],
    byId = new Map(
      input.events.map((e) => [
        `${e.matchId}:${e.frameIndex}:${e.eventIndex}`,
        e,
      ]),
    );
  const metric = (
    metricId: string,
    eventIds: string[],
    value: number | null,
    reason: string | null,
    window: unknown,
    method: string,
  ) => ({
    metricId,
    metricVersion: 1,
    processingVersion: sequences.processingVersion,
    processedAt: sequences.processedAt,
    matchId: input.matchId,
    subject: { kind: 'participant', id: puuid },
    unit: 'count',
    window,
    denominator: null,
    quality: metricQuality(reason ? 0 : 1, 1),
    value,
    origin: reason ? 'unavailable' : 'derived',
    reason,
    method,
    evidence: eventIds.map((id) => {
      const e = byId.get(id);
      return {
        source: 'MatchEventProjection',
        field: e?.type ?? 'event',
        value: 1,
        eventId: id,
        ...(e
          ? {
              frameIndex: e.frameIndex,
              ...(e.timestampMs !== null ? { timestampMs: e.timestampMs } : {}),
            }
          : {}),
      };
    }),
  });
  for (const [kind, section] of [
    ['death', 'deathEpisodes'],
    ['kill', 'killEpisodes'],
  ] as const) {
    const rows = sequences.sections[section];
    if (!Array.isArray(rows)) continue;
    for (const raw of rows) {
      const row = record(raw),
        source = record(row.event),
        eventId = typeof source.eventId === 'string' ? source.eventId : null;
      if (!eventId) continue;
      if (kind === 'kill' && byId.get(eventId)?.actorPuuid !== puuid) continue;
      const captures = Array.isArray(row.objectives)
        ? row.objectives.map(record)
        : [];
      const ids = [
        eventId,
        ...captures.flatMap((o) =>
          typeof o.eventId === 'string' ? [o.eventId] : [],
        ),
      ];
      const time = isFiniteNumber(source.timestampMs)
        ? source.timestampMs
        : null;
      const window = { startMs: time, endMs: row.windowEndMs, bounds: '(]' };
      const reason =
        row.eligible === true
          ? null
          : typeof row.reason === 'string'
            ? row.reason
            : 'missing_field';
      episodes.push({
        id: `${kind}:${eventId}:${String(row.windowMs)}`,
        kind,
        timestampMs: time,
        title:
          kind === 'death'
            ? 'Morte registrada e capturas posteriores'
            : 'Abate registrado e capturas posteriores',
        interpretation:
          'Associação temporal; não demonstra causa, culpa, disponibilidade do objetivo ou intenção.',
        window,
        occurrence: metric(
          kind === 'death' ? 'C07' : 'O05',
          [eventId],
          1,
          null,
          time === null ? null : { startMs: time, endMs: time, bounds: '[]' },
          'One distinct recorded event; captures do not multiply the number of deaths/kills',
        ),
        associatedCaptures: metric(
          kind === 'death' ? 'C07' : 'O05',
          ids,
          reason ? null : captures.length,
          reason,
          window,
          'Count captures returned by the versioned temporal-sequence calculation; association is not causation',
        ),
        eventIds: ids,
      });
    }
  }
  const chronology = objectives.sections.chronology;
  if (Array.isArray(chronology))
    for (const raw of chronology) {
      const row = record(raw);
      if (typeof row.eventId !== 'string') continue;
      const time = isFiniteNumber(row.timestampMs) ? row.timestampMs : null;
      const id = row.eventId;
      episodes.push({
        id: `objective:${id}`,
        kind: 'objective',
        timestampMs: time,
        title: 'Objetivo ou estrutura registrada',
        interpretation:
          'Captura registrada; autor, beneficiário e dono da estrutura são campos distintos.',
        window:
          time === null ? null : { startMs: time, endMs: time, bounds: '[]' },
        occurrence: metric(
          typeof row.metricId === 'string' ? row.metricId : 'O01',
          [id],
          1,
          null,
          null,
          'One distinct recorded objective/structure event',
        ),
        associatedCaptures: null,
        eventIds: [id],
      });
    }
  return episodes.sort(
    (a, b) =>
      (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
}
export function presentEpisode(
  episode: ReportEpisode,
  input: ReportInput,
  puuid: string,
  options: ReportOptions,
) {
  const base = reportBase(input.matchId, puuid),
    meta = {
      metricVersion: 1,
      processingVersion: sourceKnown(input)
        ? input.processing!.processingVersion
        : null,
      processedAt: sourceKnown(input) ? sourceTime(input) : null,
    };
  const href = `${base}/episodes/${encodeURIComponent(episode.id)}`;
  return {
    ...episode,
    occurrence: reportMetric(
      episode.occurrence,
      'episodes',
      [episode.id, 'occurrence'],
      meta,
      base,
      options.evidenceLimit,
      options.mode,
    ),
    associatedCaptures: episode.associatedCaptures
      ? reportMetric(
          episode.associatedCaptures,
          'episodes',
          [episode.id, 'associatedCaptures'],
          meta,
          base,
          options.evidenceLimit,
          options.mode,
        )
      : null,
    eventIds: undefined,
    events: page(
      episode.eventIds,
      options.offset,
      options.limit,
      (id) => ({
        eventId: id,
        href: `${base}/evidence/${encodeURIComponent(`event:${id}`)}`,
      }),
      (offset) =>
        `${href}?offset=${offset}&limit=${options.limit}&evidenceLimit=${options.evidenceLimit}`,
    ),
    href,
  };
}
export function filteredEpisodes(
  episodes: ReportEpisode[],
  options: ReportOptions,
) {
  return episodes.filter(
    (e) =>
      (!options.kind || e.kind === options.kind) && withinOutput(e, options),
  );
}
