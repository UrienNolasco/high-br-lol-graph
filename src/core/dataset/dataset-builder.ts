import { createHash } from 'node:crypto';
import {
  gameVersionPatch,
  metricQuality,
  normalizeRole,
  selectCheckpoint,
} from '../metrics';
import { MetricEvidence, MetricResult } from '../metrics/metric-contract';
import type { NormalizedTimelineEvent } from '../../modules/matches/contracts/normalized-events';
import type {
  TimelineSnapshotProjection,
  ParticipantSnapshot,
} from '../../modules/matches/contracts/normalized-snapshots';
import type { ProcessedMatchData } from '../../modules/matches/contracts/normalized-match';
import { computeContribution } from '../../modules/matches/pure/contribution-calculator';
import { calculateVisionTotals } from '../../modules/matches/pure/vision-calculator';
import { calculateCombat } from '../../modules/matches/pure/combat-calculator';
import { calculateObjectives } from '../../modules/matches/pure/objectives-calculator';
import { calculateSequences } from '../../modules/matches/pure/sequences-calculator';
import {
  DATASET_DEFINITIONS,
  DATASET_DEFINITION_MAP,
  DATASET_HORIZONS,
  DATASET_VERSION,
  DatasetDefinition,
  DatasetSubject,
  EVENT_DATASET_FIELDS,
  SNAPSHOT_DATASET_FIELDS,
} from './dataset-registry';

export interface DatasetInput extends ProcessedMatchData {
  projection: TimelineSnapshotProjection;
  events: NormalizedTimelineEvent[];
  processingVersion: number;
  processedAt: Date;
  lineage: {
    observationIds: string[];
    sources: string[];
    status: 'observed' | 'unknown';
    reason: string | null;
  };
}
type Cell = Pick<
  MetricResult,
  | 'value'
  | 'origin'
  | 'reason'
  | 'method'
  | 'quality'
  | 'evidence'
  | 'denominator'
>;
export interface DatasetContribution {
  id: string;
  matchId: string;
  datasetVersion: number;
  subjectKind: DatasetSubject;
  subjectId: string;
  definitionId: string;
  definitionVersion: number;
  usage: DatasetDefinition['usage'];
  horizonKey: string;
  horizonMs: number | null;
  sourceMaxTimestampMs: number | null;
  horizonComplete: boolean;
  metricId: string;
  unit: string;
  value: number | null;
  sumValue: number;
  validCount: number;
  sampleCount: number;
  numerator: number | null;
  denominatorValue: number | null;
  ratioScale: number;
  origin: string;
  reason: string | null;
  method: string | null;
  eligible: boolean;
  exclusionReason: string | null;
  patch: string | null;
  queueId: number;
  mapId: number;
  championId: number | null;
  role: string | null;
  teamId: number | null;
  playerIds: string[];
  gameCreation: bigint;
  quality: unknown;
  evidence: unknown;
  denominator: unknown;
  lineage: DatasetInput['lineage'];
  processingVersion: number;
  processedAt: Date;
}
export const contributionIdentity = (
  matchId: string,
  kind: DatasetSubject,
  subjectId: string,
  definitionId: string,
  version: number,
  horizonKey: string,
) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        matchId,
        kind,
        subjectId,
        definitionId,
        version,
        horizonKey,
      ]),
    )
    .digest('hex');
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const path = (value: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((v, k) => object(v)[k], value);
const cell = (
  rawValue: number | null,
  evidence: MetricEvidence[] = [],
  rawReason: string | null = null,
  method = 'literal timestamped observation',
): Cell => {
  const value = finite(rawValue) ? rawValue : null;
  const reason =
    rawReason ??
    (rawValue !== null && !finite(rawValue) ? 'invalid_value' : null);
  return {
    value: reason ? null : value,
    origin: reason || value === null ? 'unavailable' : 'derived',
    reason: (reason ??
      (value === null ? 'missing_field' : null)) as Cell['reason'],
    method,
    quality: metricQuality(reason || value === null ? 0 : 1, 1),
    evidence,
    denominator: null,
  };
};
function readCell(value: unknown): Cell {
  const v = object(value);
  return 'value' in v && 'quality' in v && Array.isArray(v.evidence)
    ? (value as Cell)
    : cell(null, [], 'not_calculated');
}
export function compactDatasetEvidence(evidence: MetricEvidence[]) {
  const frames = [
    ...new Set(
      evidence.flatMap((e) =>
        e.frameIndex === undefined ? [] : [e.frameIndex],
      ),
    ),
  ].sort((a, b) => a - b);
  const events = [
    ...new Set(evidence.flatMap((e) => (e.eventId ? [e.eventId] : []))),
  ].sort();
  const sources = [
    ...new Set(evidence.map((e) => `${e.source}:${e.field}`)),
  ].sort();
  return {
    sources,
    frameIndices: frames,
    eventIds: events,
    sourceObservations: evidence.length,
  };
}
function snapshotCell(
  snapshot: ParticipantSnapshot | null,
  field: keyof typeof SNAPSHOT_DATASET_FIELDS,
  frameIndex: number | null,
  timestampMs: number | null,
): Cell {
  if (!snapshot || timestampMs === null || frameIndex === null)
    return cell(null, [], 'missing_frame');
  const fields: Array<
    Exclude<keyof typeof SNAPSHOT_DATASET_FIELDS, 'totalCs'>
  > = field === 'totalCs' ? ['minionsKilled', 'jungleMinionsKilled'] : [field];
  const values = fields.map((f) => snapshot[f]);
  const evidence = fields.map((f, i) => ({
    source: 'MatchTimelineProjection.frames',
    field: `participantFrames.${snapshot.participantId}.${f}`,
    value: finite(values[i]) ? values[i] : null,
    frameIndex,
    timestampMs,
  }));
  const valid = values.every((v) => finite(v) && v >= 0);
  return cell(
    valid ? (values as number[]).reduce((a, b) => a + b, 0) : null,
    evidence,
    valid ? null : 'missing_field',
    field === 'totalCs'
      ? 'lane CS + jungle CS from same past-only snapshot'
      : 'literal past-only snapshot',
  );
}

/** Explicit prefix extraction. No summary totals, final reconciliation or future events influence feature values. */
export function predictiveDatasetCells(input: DatasetInput, horizonMs: number) {
  const supported =
    input.projection.projectionVersion === 1 && input.processingVersion >= 4;
  const selected = selectCheckpoint(
    (supported ? input.projection.frames : []).filter(
      (f): f is typeof f & { timestamp: number } =>
        f.timestamp !== null && finite(f.timestamp) && f.timestamp <= horizonMs,
    ),
    horizonMs,
    horizonMs,
    'pastOnly',
  );
  const prefixCandidates = input.events.filter(
    (e) =>
      (e.timestampMs !== null &&
        e.timestampMs >= 0 &&
        e.timestampMs <= horizonMs) ||
      (e.timestampMs === null &&
        e.frameTimestampMs !== null &&
        e.frameTimestampMs >= 0 &&
        e.frameTimestampMs <= horizonMs),
  );
  const eventIdentities = new Map<string, NormalizedTimelineEvent>();
  const conflictingTypes = new Set<string | null>();
  for (const event of prefixCandidates) {
    const key = `${event.frameIndex}:${event.eventIndex}`;
    const previous = eventIdentities.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
      conflictingTypes.add(previous.type);
      conflictingTypes.add(event.type);
    }
    eventIdentities.set(key, event);
  }
  const prefixEvents = [...eventIdentities.values()];
  const subjects: Array<{
    kind: DatasetSubject;
    id: string;
    players: DatasetInput['participants'];
  }> = [
    ...input.participants.map((p) => ({
      kind: 'participant' as const,
      id: p.puuid,
      players: [p],
    })),
    ...[100, 200].map((teamId) => ({
      kind: 'team' as const,
      id: String(teamId),
      players: input.participants.filter((p) => p.teamId === teamId),
    })),
    { kind: 'match', id: input.match.matchId, players: input.participants },
  ];
  const roster = new Set(input.participants.map((p) => p.puuid));
  const knownActor = (e: NormalizedTimelineEvent) =>
    e.actorPuuid !== null && roster.has(e.actorPuuid);
  const environmental = (e: NormalizedTimelineEvent) =>
    e.type === 'CHAMPION_KILL' &&
    e.payload.killerId === 0 &&
    e.quality.sentinelFields.includes('killerId');
  const validAssists = (e: NormalizedTimelineEvent) =>
    e.assistingPuuids !== null &&
    e.assistingPuuids.every((p) => p !== null && roster.has(p)) &&
    ![
      ...e.quality.invalidFields,
      ...e.quality.sentinelFields,
      ...e.quality.missingFields,
    ].some((f) => f.startsWith('assistingParticipantIds'));
  const output: Array<{
    definitionId: string;
    kind: DatasetSubject;
    subjectId: string;
    metric: Cell;
    sourceMaxTimestampMs: number | null;
  }> = [];
  for (const subject of subjects) {
    const puuids = new Set(subject.players.map((p) => p.puuid));
    for (const definition of DATASET_DEFINITIONS.filter(
      (d) => d.usage === 'predictive' && d.subjectKinds.includes(subject.kind),
    )) {
      let metric: Cell;
      let max = selected.timestampMs;
      if (definition.id.startsWith('snapshot.')) {
        const field = definition.id.slice(
          'snapshot.'.length,
        ) as keyof typeof SNAPSHOT_DATASET_FIELDS;
        const values = subject.players.map((p) => {
          const rows = Object.values(
            selected.frame?.participantFrames ?? {},
          ).filter((row) => row.puuid === p.puuid);
          return snapshotCell(
            rows.length === 1 ? rows[0] : null,
            field,
            selected.frame?.frameIndex ?? null,
            selected.timestampMs,
          );
        });
        const complete =
          values.length === (subject.kind === 'team' ? 5 : 1) &&
          values.every((v) => v.value !== null);
        metric = cell(
          complete ? values.reduce((sum, v) => sum + v.value!, 0) : null,
          values.flatMap((v) => v.evidence),
          complete ? null : 'missing_frame',
          subject.kind === 'team'
            ? 'sum of five same-frame past-only participant counters'
            : 'past-only snapshot, tolerance60000ms',
        );
        metric.quality = metricQuality(
          values.filter((v) => v.value !== null).length,
          Math.max(subject.kind === 'team' ? 5 : 1, values.length),
        );
      } else {
        const field = definition.id.slice(
          'events.'.length,
        ) as keyof typeof EVENT_DATASET_FIELDS;
        const [, type, relation] = EVENT_DATASET_FIELDS[field];
        const candidates = prefixEvents.filter((e) => e.type === type);
        const invalid =
          conflictingTypes.has(type) ||
          candidates.some(
            (e) =>
              e.matchId !== input.match.matchId ||
              e.timestampMs === null ||
              e.processingVersion !== input.processingVersion ||
              e.metricVersion !== 1 ||
              (relation === 'victim'
                ? e.victimPuuid === null || !roster.has(e.victimPuuid)
                : relation === 'assistants'
                  ? !validAssists(e)
                  : relation === 'solo'
                    ? !validAssists(e) || (!knownActor(e) && !environmental(e))
                    : subject.kind !== 'match' &&
                      !knownActor(e) &&
                      !environmental(e)),
          );
        const events = candidates.filter((e) => {
          if (subject.kind === 'match') return true;
          if (relation === 'victim')
            return e.victimPuuid !== null && puuids.has(e.victimPuuid);
          if (relation === 'assistants')
            return e.assistingPuuids?.some((p) => p !== null && puuids.has(p));
          if (relation === 'solo')
            return (
              e.actorPuuid !== null &&
              puuids.has(e.actorPuuid) &&
              e.assistingPuuids?.length === 0
            );
          return e.actorPuuid !== null && puuids.has(e.actorPuuid);
        });
        const evidence: MetricEvidence[] = events.map((e) => ({
          source: 'MatchEventProjection',
          field: e.type!,
          value: 1,
          eventId: `${e.matchId}:${e.frameIndex}:${e.eventIndex}`,
          frameIndex: e.frameIndex,
          timestampMs: e.timestampMs ?? undefined,
        }));
        if (selected.frame)
          evidence.push({
            source: 'MatchTimelineProjection.frames',
            field: 'prefix_sample_coverage',
            value: 1,
            frameIndex: selected.frame.frameIndex,
            timestampMs: selected.timestampMs,
          });
        max = evidence.reduce<number | null>(
          (n, e) =>
            e.timestampMs === undefined ? n : Math.max(n ?? 0, e.timestampMs),
          null,
        );
        metric = cell(
          selected.frame && !invalid ? events.length : null,
          evidence,
          selected.frame ? (invalid ? 'missing_field' : null) : 'missing_frame',
          'count distinct registered prefix events with known timestamp/attribution <= horizon; no final reconciliation',
        );
        metric.quality = metricQuality(
          candidates.filter((e) => e.timestampMs !== null).length,
          candidates.length,
        );
      }
      if (!supported) {
        metric = cell(null, [], 'unsupported_version');
        max = null;
      }
      output.push({
        definitionId: definition.id,
        kind: subject.kind,
        subjectId: subject.id,
        metric,
        sourceMaxTimestampMs: max,
      });
    }
  }
  return output;
}

/** Same deterministic identities on replay; caller atomically replaces the entire match contribution set. */
export function buildHistoricalDataset(
  input: DatasetInput,
): DatasetContribution[] {
  if (
    input.processingVersion < 4 ||
    !Number.isFinite(input.processedAt.getTime())
  )
    throw new Error('Dataset requires generation4+ completed provenance');
  const rows: DatasetContribution[] = [];
  const processing = {
    status: 'COMPLETED',
    processingVersion: input.processingVersion,
    completedAt: input.processedAt,
  };
  const endMs =
    input.projection.observedEndMs ?? input.match.gameDuration * 1000;
  const add = (
    definitionId: string,
    kind: DatasetSubject,
    subjectId: string,
    metric: Cell,
    horizonMs: number | null = null,
    sourceMaxTimestampMs: number | null = null,
    numeratorOverride?: number | null,
  ) => {
    const definition = DATASET_DEFINITION_MAP.get(definitionId)!;
    if (!definition || !definition.subjectKinds.includes(kind))
      throw new Error('Unknown dataset definition/subject');
    const player =
      kind === 'participant'
        ? input.participants.find((p) => p.puuid === subjectId)
        : undefined;
    const teamId =
      player?.teamId ?? (kind === 'team' ? Number(subjectId) : null);
    const members =
      kind === 'participant'
        ? player
          ? [player]
          : []
        : kind === 'team'
          ? input.participants.filter((p) => p.teamId === teamId)
          : input.participants;
    const value = finite(metric.value) ? metric.value : null;
    const horizonComplete = horizonMs === null || endMs >= horizonMs;
    const eligible = input.match.populationEligible && horizonComplete;
    const denominatorValue = finite(metric.denominator?.value)
      ? metric.denominator.value
      : null;
    const ratioScale =
      definition.unit === 'percent'
        ? 100
        : definition.unit.endsWith('_per_minute') &&
            metric.denominator?.unit === 'seconds'
          ? 60
          : 1;
    const numerator =
      numeratorOverride !== undefined
        ? numeratorOverride
        : value !== null && denominatorValue !== null
          ? (value * denominatorValue) / ratioScale
          : null;
    const horizonKey = horizonMs === null ? 'final' : `t:${horizonMs}`;
    if (
      horizonMs !== null &&
      value !== null &&
      (sourceMaxTimestampMs === null || sourceMaxTimestampMs > horizonMs)
    )
      throw new Error('Predictive source exceeds horizon or lacks source time');
    rows.push({
      id: contributionIdentity(
        input.match.matchId,
        kind,
        subjectId,
        definitionId,
        definition.version,
        horizonKey,
      ),
      matchId: input.match.matchId,
      datasetVersion: DATASET_VERSION,
      subjectKind: kind,
      subjectId,
      definitionId,
      definitionVersion: definition.version,
      usage: definition.usage,
      horizonKey,
      horizonMs,
      sourceMaxTimestampMs,
      horizonComplete,
      metricId: definition.metricId,
      unit: definition.unit,
      value,
      sumValue: value ?? 0,
      validCount: value === null ? 0 : 1,
      sampleCount: 1,
      numerator,
      denominatorValue,
      ratioScale,
      origin: value === null ? 'unavailable' : metric.origin,
      reason: value === null ? (metric.reason ?? 'missing_field') : null,
      method: metric.method,
      eligible,
      exclusionReason: input.match.populationEligible
        ? horizonComplete
          ? null
          : 'short_match'
        : (input.match.populationExclusionReason ?? 'unknown_eligibility'),
      patch: gameVersionPatch(input.match.gameVersion),
      queueId: input.match.queueId,
      mapId: input.match.mapId,
      championId: player?.championId ?? null,
      role: player ? normalizeRole(player.role) : null,
      teamId,
      playerIds: [...new Set(members.map((p) => p.puuid))].sort(),
      gameCreation: input.match.gameCreation,
      quality: metric.quality,
      evidence: compactDatasetEvidence(metric.evidence),
      denominator: metric.denominator,
      lineage: input.lineage,
      processingVersion: input.processingVersion,
      processedAt: input.processedAt,
    });
  };
  for (const horizon of DATASET_HORIZONS)
    for (const row of predictiveDatasetCells(input, horizon))
      add(
        row.definitionId,
        row.kind,
        row.subjectId,
        row.metric,
        horizon,
        row.sourceMaxTimestampMs,
      );
  const combat = calculateCombat({
    matchId: input.match.matchId,
    gameDuration: input.match.gameDuration,
    participants: input.participants,
    events: input.events,
    processingVersion: input.processingVersion,
    processedAt: input.processedAt.toISOString(),
    projectionComplete: input.projection.observedEndMs !== null,
  });
  const objectives = calculateObjectives({
    ...input.match,
    participants: input.participants,
    teams: input.teams,
    events: input.events,
    processing,
  });
  const sequences = calculateSequences({
    ...input.match,
    participants: input.participants,
    teams: input.teams,
    events: input.events,
    projection: input.projection,
    processing,
  });
  const visionTotals = calculateVisionTotals({
    ...input.match,
    participants: input.participants,
    events: input.events,
    processing,
  });
  for (const player of input.participants) {
    const contribution = computeContribution(
      {
        matchId: input.match.matchId,
        mapId: input.match.mapId,
        processingVersion: input.processingVersion,
        processedAt: input.processedAt.toISOString(),
        participants: input.participants,
      },
      player,
    );
    const vision = visionTotals.get(player.puuid);
    const combatPlayer = combat.participants.find(
      (p) => p.puuid === player.puuid,
    );
    for (const definition of DATASET_DEFINITIONS.filter(
      (d) =>
        d.usage === 'descriptive' &&
        d.subjectKinds.includes('participant') &&
        d.path,
    )) {
      const source = definition.source.startsWith('MET10')
        ? contribution
        : definition.source.startsWith('MET11')
          ? vision
          : combatPlayer;
      add(
        definition.id,
        'participant',
        player.puuid,
        readCell(path(source, definition.path!)),
      );
    }
    const deathRate = sequences.report?.deathRates.find(
      (r) => r.subjectId === player.puuid,
    );
    add(
      'final.deathsNearObjectives',
      'participant',
      player.puuid,
      readCell(deathRate?.rate),
      null,
      null,
      deathRate?.rate.denominator?.value !== null
        ? (deathRate?.associatedEvents ?? null)
        : null,
    );
    add('label.win', 'participant', player.puuid, {
      ...cell(
        player.win ? 1 : 0,
        [{ source: 'MatchParticipant', field: 'win', value: player.win }],
        null,
        'final observed outcome, label only',
      ),
      origin: 'observed',
    });
  }
  for (const team of input.teams) {
    const totals = objectives.report?.finalTotals.find(
      (t) => t.teamId === team.teamId,
    );
    for (const definition of DATASET_DEFINITIONS.filter((d) =>
      d.source.startsWith('MET14'),
    ))
      add(
        definition.id,
        'team',
        String(team.teamId),
        readCell(path(totals, definition.path!)),
      );
    const rate = sequences.report?.killRates.find(
      (r) => r.subjectId === String(team.teamId) && r.windowMs === 60000,
    );
    add(
      'final.objectivesAfterKills60',
      'team',
      String(team.teamId),
      readCell(rate?.rate),
      null,
      null,
      rate?.rate.denominator?.value !== null
        ? (rate?.associatedEvents ?? null)
        : null,
    );
    add('label.win', 'team', String(team.teamId), {
      ...cell(
        team.win ? 1 : 0,
        [{ source: 'MatchTeam', field: 'win', value: team.win }],
        null,
        'final observed outcome, label only',
      ),
      origin: 'observed',
    });
  }
  add(
    'final.winnerObservedDeficit',
    'match',
    input.match.matchId,
    readCell(sequences.report?.comeback.largestObservedDeficit),
  );
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
