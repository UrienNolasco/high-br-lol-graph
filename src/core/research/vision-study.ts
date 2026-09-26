import { selectCheckpoint } from '../metrics';
import type { NormalizedTimelineEvent } from '../../modules/matches/contracts/normalized-events';
import type { TimelineSnapshotProjection } from '../../modules/matches/contracts/normalized-snapshots';
import { VISION_WARD_TYPES } from '../../modules/matches/pure/vision-calculator';
import { splitForMatch, TemporalSplit } from '../dataset/dataset-export';

export const VISION_STUDY_VERSION = 1;
export const STUDY_HORIZONS = [600000, 900000, 1200000] as const;
export const STUDY_WINDOWS = ['cumulative', 'last5minutes'] as const;
export type StudyWindow = (typeof STUDY_WINDOWS)[number];
export const CONTEXT_FEATURES = ['goldDiff', 'killDiff', 'towerDiff'] as const;
export const VISION_FEATURES = [
  'recognizedPlacementDiff',
  'recognizedRemovalDiff',
  'controlPlacementDiff',
] as const;
export const FEATURE_NAMES = [
  ...CONTEXT_FEATURES,
  ...VISION_FEATURES,
  'unknownPlacementDiff',
  'unknownRemovalDiff',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export interface StudyProjection {
  matchId: string;
  participants: Array<{ participantId: number; puuid: string; teamId: number }>;
  projection: TimelineSnapshotProjection;
  events: NormalizedTimelineEvent[];
  processingVersion: number;
}
export interface StudyFeatureRow {
  matchId: string;
  featureVersion: number;
  horizonMs: number;
  window: StudyWindow;
  windowStartMs: number;
  bounds: '[]' | '(]';
  sourceMaxTimestampMs: number | null;
  values: Record<FeatureName, number | null>;
  reasons: Record<FeatureName, string | null>;
}
export interface StudyFeatureResult {
  features: StudyFeatureRow;
  coverage: {
    frameIndex: number | null;
    frameTimestampMs: number | null;
    rosterComplete: boolean;
    sourceEventIds: string[];
    registeredWardEvents: number;
    recognizedWardEvents: number;
    unknownWardEvents: number;
    recognizedWardFraction: number | null;
    units: 'registered_ward_events';
  };
}
const finiteNonnegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const recognizedWard = (event: NormalizedTimelineEvent) =>
  (VISION_WARD_TYPES as readonly unknown[]).includes(event.payload.wardType);
const eventId = (event: NormalizedTimelineEvent) =>
  `${event.matchId}:${event.frameIndex}:${event.eventIndex}`;

/** This boundary intentionally has no outcome, duration, final counters or job completion time. */
export function extractVisionFeatures(
  input: StudyProjection,
  horizonMs: number,
  window: StudyWindow = 'cumulative',
): StudyFeatureResult {
  if (!STUDY_HORIZONS.includes(horizonMs as (typeof STUDY_HORIZONS)[number]))
    throw new Error('Unsupported prespecified study horizon');
  if (!STUDY_WINDOWS.includes(window))
    throw new Error('Unsupported study window');
  const start = window === 'cumulative' ? 0 : horizonMs - 300000;
  const roster = new Map(input.participants.map((p) => [p.puuid, p]));
  const rosterComplete =
    input.participants.length === 10 &&
    roster.size === 10 &&
    new Set(input.participants.map((p) => p.participantId)).size === 10 &&
    [100, 200].every(
      (team) =>
        input.participants.filter((p) => p.teamId === team).length === 5,
    );
  const supported =
    input.projection.projectionVersion === 1 && input.processingVersion >= 4;
  const selected = selectCheckpoint(
    (supported ? input.projection.frames : []).filter(
      (f): f is typeof f & { timestamp: number } =>
        finiteNonnegative(f.timestamp) && f.timestamp <= horizonMs,
    ),
    horizonMs,
    horizonMs,
    'pastOnly',
  );
  // Keep uncertain timestamps in their observed frame, never import a future frame.
  const candidates = input.events.filter((e) => {
    const timestamp = finiteNonnegative(e.timestampMs)
      ? e.timestampMs
      : e.frameTimestampMs;
    return (
      timestamp === null ||
      (finiteNonnegative(timestamp) && timestamp <= horizonMs)
    );
  });
  const identities = new Map<string, NormalizedTimelineEvent>();
  const conflicts = new Set<string | null>();
  for (const e of candidates) {
    const id = eventId(e),
      previous = identities.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(e)) {
      conflicts.add(previous.type);
      conflicts.add(e.type);
    }
    identities.set(id, e);
  }
  const prefix = [...identities.values()].filter(
    (e) =>
      !finiteNonnegative(e.timestampMs) ||
      (window === 'cumulative'
        ? e.timestampMs >= start
        : e.timestampMs > start),
  );
  const relevant = prefix.filter((e) =>
    ['WARD_PLACED', 'WARD_KILL', 'CHAMPION_KILL', 'BUILDING_KILL'].includes(
      e.type ?? '',
    ),
  );
  const baseReason = !supported
    ? 'unsupported_version'
    : !rosterComplete
      ? 'incomplete_roster'
      : !selected.frame
        ? 'missing_past_frame'
        : null;
  const values = Object.fromEntries(
    FEATURE_NAMES.map((key) => [key, null]),
  ) as StudyFeatureRow['values'];
  const reasons = Object.fromEntries(
    FEATURE_NAMES.map((key) => [key, baseReason]),
  ) as StudyFeatureRow['reasons'];
  const validEvent = (e: NormalizedTimelineEvent) =>
    e.matchId === input.matchId &&
    finiteNonnegative(e.timestampMs) &&
    e.processingVersion === input.processingVersion &&
    e.metricVersion === 1;
  const attributedTeam = (e: NormalizedTimelineEvent) =>
    roster.get(e.actorPuuid ?? '')?.teamId ?? null;
  const countDifference = (
    key: FeatureName,
    type: string,
    matches: (e: NormalizedTimelineEvent) => boolean,
    team: (e: NormalizedTimelineEvent) => number | null = attributedTeam,
    allowedUnknown: (e: NormalizedTimelineEvent) => boolean = () => false,
    invalidExtra: (e: NormalizedTimelineEvent) => boolean = () => false,
  ) => {
    const events = prefix.filter((e) => e.type === type);
    const invalid =
      conflicts.has(type) ||
      events.some(
        (e) =>
          !validEvent(e) ||
          invalidExtra(e) ||
          (team(e) === null && !allowedUnknown(e)),
      );
    const reason =
      baseReason ?? (invalid ? 'incomplete_timestamp_or_attribution' : null);
    reasons[key] = reason;
    if (reason) return;
    values[key] = events
      .filter(matches)
      .reduce(
        (sum, e) => sum + (team(e) === 100 ? 1 : team(e) === 200 ? -1 : 0),
        0,
      );
  };
  for (const [type, knownKey, unknownKey] of [
    ['WARD_PLACED', 'recognizedPlacementDiff', 'unknownPlacementDiff'],
    ['WARD_KILL', 'recognizedRemovalDiff', 'unknownRemovalDiff'],
  ] as const) {
    countDifference(knownKey, type, recognizedWard);
    countDifference(unknownKey, type, (e) => !recognizedWard(e));
  }
  countDifference(
    'controlPlacementDiff',
    'WARD_PLACED',
    (e) => e.payload.wardType === 'CONTROL_WARD',
  );
  countDifference(
    'killDiff',
    'CHAMPION_KILL',
    () => true,
    attributedTeam,
    (e) =>
      e.payload.killerId === 0 && e.quality.sentinelFields.includes('killerId'),
  );
  countDifference(
    'towerDiff',
    'BUILDING_KILL',
    (e) => e.payload.buildingType === 'TOWER_BUILDING',
    (e) =>
      [100, 200].includes(e.beneficiaryTeamId ?? 0)
        ? e.beneficiaryTeamId
        : null,
    () => false,
    (e) =>
      !['TOWER_BUILDING', 'INHIBITOR_BUILDING'].includes(
        String(e.payload.buildingType),
      ),
  );
  if (!baseReason) {
    const snapshots = Object.values(selected.frame!.participantFrames);
    const playerGold = input.participants.map((p) => {
      const found = snapshots.filter(
        (s) => s.puuid === p.puuid && s.participantId === p.participantId,
      );
      return found.length === 1 && finiteNonnegative(found[0].totalGold)
        ? found[0].totalGold
        : null;
    });
    const difference = playerGold.every((gold) => gold !== null)
      ? playerGold.reduce<number>(
          (sum, gold, i) =>
            sum + gold! * (input.participants[i].teamId === 100 ? 1 : -1),
          0,
        )
      : null;
    values.goldDiff =
      difference !== null && Number.isFinite(difference) ? difference : null;
    reasons.goldDiff =
      values.goldDiff === null ? 'missing_or_invalid_gold' : null;
  }
  const wards = relevant.filter(
    (e) => e.type === 'WARD_PLACED' || e.type === 'WARD_KILL',
  );
  const known = wards.filter(recognizedWard).length;
  const timestamps = relevant.flatMap((e) =>
    finiteNonnegative(e.timestampMs) ? [e.timestampMs] : [],
  );
  if (selected.timestampMs !== null) timestamps.push(selected.timestampMs);
  return {
    features: {
      matchId: input.matchId,
      featureVersion: VISION_STUDY_VERSION,
      horizonMs,
      window,
      windowStartMs: start,
      bounds: window === 'cumulative' ? '[]' : '(]',
      sourceMaxTimestampMs: timestamps.length ? Math.max(...timestamps) : null,
      values,
      reasons,
    },
    coverage: {
      frameIndex: selected.frame?.frameIndex ?? null,
      frameTimestampMs: selected.timestampMs,
      rosterComplete,
      sourceEventIds: relevant.map(eventId).sort(),
      registeredWardEvents: wards.length,
      recognizedWardEvents: known,
      unknownWardEvents: wards.length - known,
      recognizedWardFraction: wards.length ? known / wards.length : null,
      units: 'registered_ward_events',
    },
  };
}

export interface StudySample {
  matchId: string;
  sourceFingerprint: string;
  sourceKind: 'real' | 'synthetic';
  gameCreation: number;
  patch: string | null;
  queueId: number;
  mapId: number;
  playerIds: string[];
  populationEligible: boolean;
  exclusionReason: string | null;
  team100Win: number | null;
  results: StudyFeatureResult[];
}
export function independentSamples(samples: StudySample[]) {
  const matches = new Map<string, StudySample>();
  const fingerprints = new Set<string>();
  const accepted: StudySample[] = [],
    excluded: Array<{ matchId: string; reason: string }> = [];
  for (const sample of [...samples].sort((a, b) =>
    a.matchId.localeCompare(b.matchId),
  )) {
    if (sample.sourceKind !== 'real') {
      excluded.push({
        matchId: sample.matchId,
        reason: 'synthetic_not_independent',
      });
      continue;
    }
    const previous = matches.get(sample.matchId);
    if (previous && previous.sourceFingerprint !== sample.sourceFingerprint)
      throw new Error(`Conflicting source identity: ${sample.matchId}`);
    if (previous && previous.team100Win !== sample.team100Win)
      throw new Error(`Conflicting outcome identity: ${sample.matchId}`);
    matches.set(sample.matchId, sample);
    if (previous || fingerprints.has(sample.sourceFingerprint)) {
      excluded.push({
        matchId: sample.matchId,
        reason: previous ? 'duplicate_match_id' : 'duplicate_source_content',
      });
      continue;
    }
    fingerprints.add(sample.sourceFingerprint);
    accepted.push(sample);
  }
  return { samples: accepted, excluded };
}
export function wilsonInterval(
  wins: number,
  n: number,
): [number, number] | null {
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    !Number.isInteger(wins) ||
    wins < 0 ||
    wins > n
  )
    throw new Error('Invalid binomial counts');
  if (!n) return null;
  const z = 1.959963984540054,
    p = wins / n,
    scale = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / scale;
  const radius =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / scale;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export interface ModelThresholds {
  minimumMatches: number;
  minimumTrain: number;
  minimumValidation: number;
  minimumTest: number;
  minimumClassPerSplit: number;
  minimumFeatureCoverage: number;
  minimumRecognizedWardFraction: number;
}
export interface StudyProtocol {
  version: 1;
  patch: string;
  queueId: 420;
  mapId: 11;
  split: TemporalSplit;
  thresholds: ModelThresholds;
}
const complete = (r: StudyFeatureResult) =>
  [...CONTEXT_FEATURES, ...VISION_FEATURES].every(
    (name) => r.features.values[name] !== null,
  );
export function evaluateModelGate(
  samples: StudySample[],
  protocol: StudyProtocol,
  horizonMs: number,
  window: StudyWindow,
) {
  const unique = independentSamples(samples).samples;
  const matching = unique.filter(
    (s) =>
      s.patch === protocol.patch &&
      s.queueId === protocol.queueId &&
      s.mapId === protocol.mapId &&
      s.populationEligible &&
      (s.team100Win === 0 || s.team100Win === 1),
  );
  const usable = matching.filter((s) => {
    const result = s.results.find(
      (r) => r.features.horizonMs === horizonMs && r.features.window === window,
    );
    return result && complete(result);
  });
  const splitRows = Object.fromEntries(
    ['train', 'validation', 'test'].map((partition) => [
      partition,
      usable.filter(
        (s) => splitForMatch(s.gameCreation, protocol.split) === partition,
      ),
    ]),
  ) as Record<'train' | 'validation' | 'test', StudySample[]>;
  const splitCounts = Object.fromEntries(
    Object.entries(splitRows).map(([name, rows]) => [
      name,
      {
        matches: rows.length,
        team100Wins: rows.filter((r) => r.team100Win === 1).length,
        team100Losses: rows.filter((r) => r.team100Win === 0).length,
      },
    ]),
  );
  const coverage = matching.length ? usable.length / matching.length : null;
  const wards = usable.map(
    (s) =>
      s.results.find(
        (r) =>
          r.features.horizonMs === horizonMs && r.features.window === window,
      )!.coverage,
  );
  const registered = wards.reduce((n, w) => n + w.registeredWardEvents, 0);
  const recognized = wards.reduce((n, w) => n + w.recognizedWardEvents, 0);
  const recognizedFraction = registered ? recognized / registered : null;
  const t = protocol.thresholds,
    reasons: string[] = [];
  if (usable.length < t.minimumMatches)
    reasons.push('insufficient_independent_matches');
  for (const [name, minimum] of [
    ['train', t.minimumTrain],
    ['validation', t.minimumValidation],
    ['test', t.minimumTest],
  ] as const) {
    if (splitRows[name].length < minimum)
      reasons.push(`insufficient_${name}_matches`);
    if (
      [0, 1].some(
        (value) =>
          splitRows[name].filter((s) => s.team100Win === value).length <
          t.minimumClassPerSplit,
      )
    )
      reasons.push(`insufficient_${name}_outcome_variation`);
  }
  if (coverage === null || coverage < t.minimumFeatureCoverage)
    reasons.push('insufficient_feature_coverage');
  if (
    recognizedFraction === null ||
    recognizedFraction < t.minimumRecognizedWardFraction
  )
    reasons.push('insufficient_ward_type_coverage');
  const trainPlayers = new Set(splitRows.train.flatMap((s) => s.playerIds));
  const validationUnseen = splitRows.validation.filter((s) =>
    s.playerIds.every((p) => !trainPlayers.has(p)),
  );
  const priorPlayers = new Set(
    [...splitRows.train, ...splitRows.validation].flatMap((s) => s.playerIds),
  );
  const testUnseen = splitRows.test.filter((s) =>
    s.playerIds.every((p) => !priorPlayers.has(p)),
  );
  const unseenEnough =
    validationUnseen.length >= t.minimumValidation &&
    testUnseen.length >= t.minimumTest &&
    [validationUnseen, testUnseen].every((rows) =>
      [0, 1].every(
        (outcome) =>
          rows.filter((s) => s.team100Win === outcome).length >=
          t.minimumClassPerSplit,
      ),
    );
  return {
    allowed: reasons.length === 0,
    reasons,
    independentMatches: unique.length,
    eligibleMatches: matching.length,
    completeFeatureMatches: usable.length,
    featureCoverage: coverage,
    recognizedWardFraction: recognizedFraction,
    splitCounts,
    recurrentPlayerSensitivity: {
      policy:
        'Drop validation matches sharing any train player; drop test matches sharing any train or validation player. Whole matches only.',
      validationRetained: validationUnseen.length,
      validationDropped: splitRows.validation.length - validationUnseen.length,
      testRetained: testUnseen.length,
      testDropped: splitRows.test.length - testUnseen.length,
      evaluable: unseenEnough,
    },
  };
}

export function describeStudy(samples: StudySample[], protocol: StudyProtocol) {
  const independent = independentSamples(samples);
  const cohort = independent.samples.filter(
    (s) =>
      s.patch === protocol.patch &&
      s.queueId === protocol.queueId &&
      s.mapId === protocol.mapId,
  );
  const tables = STUDY_HORIZONS.flatMap((horizonMs) =>
    STUDY_WINDOWS.map((window) => {
      const considered = cohort.filter(
        (s) =>
          s.populationEligible && (s.team100Win === 0 || s.team100Win === 1),
      );
      const rows = considered.flatMap((sample) => {
        const result = sample.results.find(
          (r) =>
            r.features.horizonMs === horizonMs && r.features.window === window,
        );
        return result ? [{ sample, result }] : [];
      });
      const bands = VISION_FEATURES.flatMap((exposure) =>
        ['negative', 'tie', 'positive'].map((band) => {
          const selected = rows.filter(({ result }) => {
            const value = result.features.values[exposure];
            return (
              value !== null &&
              (band === 'negative'
                ? value < 0
                : band === 'positive'
                  ? value > 0
                  : value === 0)
            );
          });
          const wins = selected.filter(
            ({ sample }) => sample.team100Win === 1,
          ).length;
          return {
            exposure,
            band,
            matches: selected.length,
            team100Wins: wins,
            team100WinRate: selected.length ? wins / selected.length : null,
            wilson95: wilsonInterval(wins, selected.length),
          };
        }),
      );
      const gate = evaluateModelGate(
        independent.samples,
        protocol,
        horizonMs,
        window,
      );
      return {
        horizonMs,
        window,
        consideredMatches: considered.length,
        missingExposure: Object.fromEntries(
          VISION_FEATURES.map((name) => [
            name,
            considered.length -
              rows.filter(({ result }) => result.features.values[name] !== null)
                .length,
          ]),
        ),
        bands,
        modelGate: gate,
      };
    }),
  );
  return {
    task: 'MET-22',
    metricId: 'H03',
    researchVersion: VISION_STUDY_VERSION,
    conclusion: tables.every((t) => !t.modelGate.allowed)
      ? 'insufficient_sample_or_coverage'
      : 'ready_for_separately_reviewed_model_evaluation',
    independentMatches: independent.samples.length,
    cohortMatches: cohort.length,
    duplicateOrSyntheticExclusions: independent.excluded,
    cohortExclusions: independent.samples
      .filter((s) => !cohort.includes(s))
      .map((s) => ({ matchId: s.matchId, reason: 'outside_patch_queue_map' })),
    populationExclusions: cohort
      .filter((s) => !s.populationEligible)
      .map((s) => ({ matchId: s.matchId, reason: s.exclusionReason })),
    missingOutcomes: cohort.filter(
      (s) => s.team100Win !== 0 && s.team100Win !== 1,
    ).length,
    tables,
    modelEvaluation: {
      fitted: false,
      auc: null,
      brier: null,
      logLoss: null,
      calibration: null,
      reason:
        'No automatic fit. Gates are necessary operational checks, not a power calculation; sufficient data requires a separately reviewed evaluation run.',
      baseline: CONTEXT_FEATURES,
      augmented: [...CONTEXT_FEATURES, ...VISION_FEATURES],
      withheld: [
        'finalVisionScore',
        'finalDuration',
        'finalRole',
        'discoveryRank',
        'outcome',
        'finalReconciliation',
      ],
    },
    interpretation:
      'Descriptive corpus frequencies only. Wilson intervals assume independent matches and ignore recurring-player dependence; player-disjoint sensitivity is separate. No causal ward target, significance, population win probability or optimal horizon is estimated.',
  };
}
