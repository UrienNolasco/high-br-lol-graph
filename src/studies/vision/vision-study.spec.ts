import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MatchDto } from '../../core/riot/dto/match.dto';
import { TimelineDto } from '../../core/riot/dto/timeline.dto';
import { normalizeTimelineEvents } from '../../modules/matches/adapters/riot/normalized-events';
import { projectTimelineSnapshots } from '../../modules/matches/adapters/riot/timeline-snapshots';
import { PROCESSING_VERSION } from '../../core/processing/processing.constants';
import { stableJson } from '../../modules/dataset/contracts/serialization';
import { splitForMatch } from '../../modules/dataset/contracts/temporal-split';
import {
  runVisionStudy,
  studySource,
  validateStudyProtocol,
} from './entrypoint';
import {
  CONTEXT_FEATURES,
  VISION_FEATURES,
  FEATURE_NAMES,
  extractVisionFeatures,
  independentSamples,
  describeStudy,
  evaluateModelGate,
  STUDY_HORIZONS,
  STUDY_WINDOWS,
  StudyProjection,
  StudyProtocol,
  StudySample,
  wilsonInterval,
} from './vision-study';

const root = join(__dirname, '../../..');
const raw = () => ({
  summary: JSON.parse(
    readFileSync(join(root, 'exemplo_partida_BR1_3200579475.json'), 'utf8'),
  ) as MatchDto,
  timeline: JSON.parse(
    readFileSync(
      join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  ) as TimelineDto,
});
const protocol = (): StudyProtocol =>
  JSON.parse(
    readFileSync(join(root, 'docs/analysis/met22-protocol.json'), 'utf8'),
  );
function projection(): StudyProjection {
  const { summary, timeline } = raw();
  const participants = summary.info.participants.map((p) => ({
    participantId: p.participantId,
    puuid: p.puuid,
    teamId: p.teamId,
  }));
  const players = new Map(participants.map((p) => [p.participantId, p.puuid]));
  return {
    matchId: summary.metadata.matchId,
    participants,
    events: normalizeTimelineEvents(
      timeline,
      players,
      new Map(participants.map((p) => [p.participantId, p.teamId])),
      { processingVersion: PROCESSING_VERSION },
    ),
    projection: projectTimelineSnapshots(timeline, players),
    processingVersion: PROCESSING_VERSION,
  };
}
const configurations = STUDY_HORIZONS.flatMap((h) =>
  STUDY_WINDOWS.map((w) => [h, w] as const),
);

describe('MET22 timestamp-only research features', () => {
  it.each(configurations)(
    'ignores removed or poisoned future observations at %i / %s',
    (horizon, window) => {
      const input = projection(),
        baseline = extractVisionFeatures(input, horizon, window);
      const prefix = structuredClone(input);
      prefix.events = prefix.events.filter(
        (e) => e.timestampMs !== null && e.timestampMs <= horizon,
      );
      prefix.projection.frames = prefix.projection.frames.filter(
        (f) => f.timestamp !== null && f.timestamp <= horizon,
      );
      prefix.projection.observedEndMs = null;
      expect(extractVisionFeatures(prefix, horizon, window)).toEqual(baseline);
      const poisoned = structuredClone(input);
      for (const event of poisoned.events)
        if (event.timestampMs! > horizon) {
          event.type = 'WARD_PLACED';
          event.actorPuuid = null;
          event.metricVersion = 999;
          event.matchId = 'foreign';
          event.payload = { wardType: 'CONTROL_WARD' };
        }
      for (const frame of poisoned.projection.frames)
        if (frame.timestamp! > horizon)
          for (const player of Object.values(frame.participantFrames))
            player.totalGold = 999999999;
      poisoned.projection.observedEndMs = 1;
      Object.assign(poisoned, {
        visionScore: 999,
        gameDuration: 1,
        win: false,
        label: 0,
        finalStats: { goldEarned: 99999 },
      });
      expect(extractVisionFeatures(poisoned, horizon, window)).toEqual(
        baseline,
      );
      expect(baseline.features.sourceMaxTimestampMs).toBeLessThanOrEqual(
        horizon,
      );
    },
  );

  it('reconciles real typed counters separately and freezes the prespecified @15 values', () => {
    const { summary, timeline } = raw(),
      source = studySource(summary, timeline);
    expect(source.audit).toMatchObject({
      registeredPlacements: 752,
      recognizedPlacements: 196,
      unknownPlacements: 556,
      recognizedRemovals: 51,
      unknownRemovals: 0,
    });
    expect(source.audit.reconciliation).toHaveLength(20);
    expect(source.audit.reconciliation.every((r) => r.status === 'pass')).toBe(
      true,
    );
    const main = source.sample.results.find(
      (r) =>
        r.features.horizonMs === 900000 && r.features.window === 'cumulative',
    )!;
    expect(main.features.values).toEqual({
      goldDiff: 1689,
      killDiff: -1,
      towerDiff: 1,
      recognizedPlacementDiff: 5,
      recognizedRemovalDiff: -3,
      controlPlacementDiff: -3,
      unknownPlacementDiff: -142,
      unknownRemovalDiff: 0,
    });
    expect(main.coverage).toMatchObject({
      frameIndex: 14,
      frameTimestampMs: 840357,
      registeredWardEvents: 244,
      recognizedWardEvents: 74,
      unknownWardEvents: 170,
    });
    expect(main.coverage.recognizedWardFraction).toBeCloseTo(74 / 244);
  });

  it('keeps final labels and reconciliation outside prefix feature values and distinguishes ambiguous outcomes', () => {
    const { summary, timeline } = raw(),
      original = studySource(summary, timeline);
    summary.info.gameDuration = 1;
    for (const p of summary.info.participants) {
      p.visionScore = 9999;
      p.wardsPlaced = 0;
      p.wardsKilled = 0;
      p.win = !p.win;
    }
    summary.info.teams.forEach((t) => {
      t.win = !t.win;
    });
    const poisoned = studySource(summary, timeline);
    expect(poisoned.sample.results).toEqual(original.sample.results);
    expect(poisoned.sample.team100Win).toBe(1 - original.sample.team100Win!);
    expect(
      poisoned.audit.reconciliation.some((r) => r.status === 'mismatch'),
    ).toBe(true);
    summary.info.teams.forEach((t) => {
      t.win = true;
    });
    expect(studySource(summary, timeline).sample.team100Win).toBeNull();
  });

  it('distinguishes observed zeros, control subsets and unknown types at inclusive end and exclusive recent start', () => {
    const input = projection(),
      template = input.events.find((e) => e.type === 'WARD_PLACED')!;
    const make = (index: number, timestampMs: number, wardType: string) => ({
      ...template,
      frameIndex: 0,
      eventIndex: index,
      timestampMs,
      actorPuuid: input.participants[0].puuid,
      payload: { wardType },
    });
    const boundary = make(1, 600000, 'CONTROL_WARD');
    input.events = [
      boundary,
      structuredClone(boundary),
      make(2, 900000, 'YELLOW_TRINKET'),
      make(3, 900000, 'FUTURE_WARD'),
      make(4, 900001, 'CONTROL_WARD'),
    ];
    const cumulative = extractVisionFeatures(input, 900000),
      recent = extractVisionFeatures(input, 900000, 'last5minutes');
    expect(cumulative.features.values).toMatchObject({
      recognizedPlacementDiff: 2,
      controlPlacementDiff: 1,
      unknownPlacementDiff: 1,
      recognizedRemovalDiff: 0,
    });
    expect(recent.features.values).toMatchObject({
      recognizedPlacementDiff: 1,
      controlPlacementDiff: 0,
      unknownPlacementDiff: 1,
    });
    input.events = [];
    expect(
      extractVisionFeatures(input, 900000).features.values
        .recognizedPlacementDiff,
    ).toBe(0);
  });

  it.each([
    'actor',
    'timestamp',
    'negative_timestamp',
    'version',
    'foreign_match',
    'conflicting_identity',
  ])('marks %s unavailable, preserving unrelated families', (mutation) => {
    const input = projection(),
      template = structuredClone(
        input.events.find(
          (e) => e.type === 'WARD_PLACED' && e.timestampMs! < 900000,
        )!,
      );
    template.frameTimestampMs = 600000;
    input.events = [template];
    if (mutation === 'actor') template.actorPuuid = null;
    if (mutation === 'timestamp') template.timestampMs = null;
    if (mutation === 'negative_timestamp') template.timestampMs = -1;
    if (mutation === 'version') template.metricVersion = 999;
    if (mutation === 'foreign_match') template.matchId = 'other';
    if (mutation === 'conflicting_identity')
      input.events.push({
        ...template,
        actorPuuid: input.participants[9].puuid,
      });
    const result = extractVisionFeatures(input, 900000);
    expect(result.features.values.recognizedPlacementDiff).toBeNull();
    expect(result.features.values.unknownPlacementDiff).toBeNull();
    expect(result.features.values.recognizedRemovalDiff).toBe(0);
    expect(result.features.values.goldDiff).toBe(1689);
  });

  it('distinguishes environmental kills and beneficiary towers without inventing actor attribution', () => {
    const input = projection();
    const kill = input.events.find((e) => e.type === 'CHAMPION_KILL')!;
    const tower = input.events.find((e) => e.type === 'BUILDING_KILL')!;
    input.events = [
      {
        ...kill,
        timestampMs: 100000,
        actorPuuid: null,
        payload: { killerId: 0 },
        quality: { ...kill.quality, sentinelFields: ['killerId'] },
      },
      {
        ...tower,
        timestampMs: 200000,
        actorPuuid: null,
        beneficiaryTeamId: 200,
        ownerTeamId: 100,
        payload: { teamId: 100, buildingType: 'TOWER_BUILDING' },
      },
    ];
    expect(extractVisionFeatures(input, 900000).features.values).toMatchObject({
      killDiff: 0,
      towerDiff: -1,
    });
    input.events[1].beneficiaryTeamId = null;
    expect(
      extractVisionFeatures(input, 900000).features.values.towerDiff,
    ).toBeNull();
  });

  it('does not replace a missing past snapshot with future data or an incomplete roster with zero', () => {
    const input = projection();
    input.projection.frames = input.projection.frames.filter(
      (f) => !(f.timestamp! >= 840000 && f.timestamp! <= 900000),
    );
    const missing = extractVisionFeatures(input, 900000);
    expect(
      Object.values(missing.features.values).every((v) => v === null),
    ).toBe(true);
    expect(missing.coverage.frameTimestampMs).toBeNull();
    const roster = projection();
    roster.participants.pop();
    expect(
      extractVisionFeatures(roster, 900000).features.reasons.goldDiff,
    ).toBe('incomplete_roster');
    const zero = projection();
    zero.projection.frames.forEach((frame) =>
      Object.values(frame.participantFrames).forEach((p) => {
        p.totalGold = 0;
      }),
    );
    expect(extractVisionFeatures(zero, 900000).features.values.goldDiff).toBe(
      0,
    );
    zero.projection.projectionVersion = 999;
    expect(extractVisionFeatures(zero, 900000).features.reasons.goldDiff).toBe(
      'unsupported_version',
    );
  });
});

describe('MET22 independent units, model gate and reproducible artifact', () => {
  const real = () => {
    const { summary, timeline } = raw();
    return studySource(summary, timeline).sample;
  };
  it('never expands N using participants, horizons, replay IDs, identical source content or synthetic rows', () => {
    const sample = real();
    const copies = Array.from({ length: 600 }, (_, i) => ({
      ...sample,
      matchId: `copy${i}`,
    }));
    const synthetic = {
      ...sample,
      matchId: 'synthetic',
      sourceFingerprint: 'new',
      sourceKind: 'synthetic' as const,
    };
    const study = describeStudy(
      [sample, sample, ...copies, synthetic],
      protocol(),
    );
    expect(study.independentMatches).toBe(1);
    expect(study.tables).toHaveLength(6);
    expect(study.tables.every((t) => t.modelGate.allowed === false)).toBe(true);
    expect(study.modelEvaluation).toMatchObject({
      fitted: false,
      auc: null,
      calibration: null,
    });
    expect(study.modelEvaluation.baseline).toEqual(CONTEXT_FEATURES);
    expect(study.modelEvaluation.augmented).toEqual([
      ...CONTEXT_FEATURES,
      ...VISION_FEATURES,
    ]);
    expect(() =>
      independentSamples([
        sample,
        { ...sample, sourceFingerprint: 'conflict' },
      ]),
    ).toThrow('Conflicting source identity');
    expect(() =>
      independentSamples([sample, { ...sample, team100Win: 0 }]),
    ).toThrow('Conflicting outcome identity');
    const { summary, timeline } = raw();
    summary.metadata.matchId = timeline.metadata.matchId = 'BR1_REPLAY';
    summary.info.gameCreation += 86400000;
    summary.info.gameDuration += 300;
    summary.info.participants.reverse();
    expect(studySource(summary, timeline).sample.sourceFingerprint).toBe(
      sample.sourceFingerprint,
    );
  });

  it('requires class diversity, typed coverage and all chronological partitions; audits repeated-player sensitivity separately', () => {
    const sample = real(),
      p = protocol();
    p.split = { trainBeforeMs: 10, validationBeforeMs: 20 };
    p.thresholds = {
      minimumMatches: 6,
      minimumTrain: 2,
      minimumValidation: 2,
      minimumTest: 2,
      minimumClassPerSplit: 1,
      minimumFeatureCoverage: 1,
      minimumRecognizedWardFraction: 0.8,
    };
    const rows: StudySample[] = [1, 2, 10, 11, 20, 21].map((time, i) => ({
      ...structuredClone(sample),
      matchId: `distinct-${i}`,
      sourceFingerprint: `independent-${i}`,
      gameCreation: time,
      team100Win: i % 2,
      results: sample.results.map((r) => ({
        ...r,
        coverage: {
          ...r.coverage,
          registeredWardEvents: 10,
          recognizedWardEvents: 10,
          unknownWardEvents: 0,
          recognizedWardFraction: 1,
        },
      })),
    }));
    const gate = evaluateModelGate(rows, p, 900000, 'cumulative');
    expect(gate.allowed).toBe(true);
    expect(gate.splitCounts).toEqual({
      train: { matches: 2, team100Wins: 1, team100Losses: 1 },
      validation: { matches: 2, team100Wins: 1, team100Losses: 1 },
      test: { matches: 2, team100Wins: 1, team100Losses: 1 },
    });
    expect(gate.recurrentPlayerSensitivity).toMatchObject({
      validationRetained: 0,
      testRetained: 0,
      evaluable: false,
    });
    rows.forEach((row, i) => {
      row.playerIds = [`new-player-${i}`];
    });
    expect(
      evaluateModelGate(rows, p, 900000, 'cumulative')
        .recurrentPlayerSensitivity.evaluable,
    ).toBe(true);
    rows[0].team100Win = 1;
    expect(evaluateModelGate(rows, p, 900000, 'cumulative').reasons).toContain(
      'insufficient_train_outcome_variation',
    );
    rows[1].results = [];
    expect(evaluateModelGate(rows, p, 900000, 'cumulative').reasons).toContain(
      'insufficient_feature_coverage',
    );
    expect(
      evaluateModelGate([sample], protocol(), 900000, 'cumulative').reasons,
    ).toContain('insufficient_ward_type_coverage');
  });

  it('excludes unsupported patches and queues instead of treating relabeled fixtures as validation', () => {
    const { summary, timeline } = raw();
    summary.info.gameVersion = '16.20.999.1';
    const sample = studySource(summary, timeline).sample;
    expect(sample.populationEligible).toBe(false);
    const future = protocol();
    future.patch = '16.20';
    const study = describeStudy([sample], future);
    expect(study.populationExclusions).toEqual([
      { matchId: sample.matchId, reason: 'unsupported_version' },
    ]);
    expect(study.tables.every((t) => !t.modelGate.allowed)).toBe(true);
    expect(
      describeStudy([{ ...sample, patch: '16.2', queueId: 440 }], protocol())
        .cohortMatches,
    ).toBe(0);
  });

  it('reports empty denominators as null and separates negative, tie and positive bands without doubling sides', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(1, 1)![0]).toBeCloseTo(0.2065493144);
    expect(wilsonInterval(1, 1)![1]).toBeCloseTo(1);
    expect(() => wilsonInterval(2, 1)).toThrow();
    const study = describeStudy([real()], protocol());
    const main = study.tables.find(
      (t) => t.horizonMs === 900000 && t.window === 'cumulative',
    )!;
    expect(
      main.bands
        .filter((b) => b.exposure === 'recognizedPlacementDiff')
        .reduce((n, b) => n + b.matches, 0),
    ).toBe(1);
    expect(
      main.bands.find(
        (b) =>
          b.exposure === 'recognizedPlacementDiff' && b.band === 'positive',
      ),
    ).toMatchObject({ matches: 1, team100Wins: 1, team100WinRate: 1 });
    expect(
      main.bands.find(
        (b) => b.exposure === 'recognizedPlacementDiff' && b.band === 'tie',
      ),
    ).toMatchObject({ matches: 0, team100WinRate: null, wilson95: null });
    expect(
      describeStudy([], protocol()).tables[0].modelGate.featureCoverage,
    ).toBeNull();
    expect(() =>
      validateStudyProtocol({
        ...protocol(),
        split: { trainBeforeMs: 20, validationBeforeMs: 10 },
      }),
    ).toThrow();
    const invalid = protocol();
    invalid.thresholds.minimumMatches = 0;
    expect(() => validateStudyProtocol(invalid)).toThrow('Invalid model gate');
  });

  it('exports byte-identical separate allowlists and genuine unknown provenance without accessing services', () => {
    const temp = mkdtempSync(join(tmpdir(), 'met22-test-'));
    try {
      const one = join(temp, 'one'),
        two = join(temp, 'two');
      for (const out of [one, two])
        runVisionStudy(
          root,
          join(root, 'docs/analysis/corpus-manifest.json'),
          join(root, 'docs/analysis/met22-protocol.json'),
          out,
        );
      for (const file of readdirSync(one))
        expect(readFileSync(join(one, file), 'utf8')).toBe(
          readFileSync(join(two, file), 'utf8'),
        );
      const features = readFileSync(join(one, 'features.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const labels = JSON.parse(
        readFileSync(join(one, 'labels.jsonl'), 'utf8'),
      );
      const metadata = JSON.parse(
        readFileSync(join(one, 'metadata.jsonl'), 'utf8'),
      );
      expect(features).toHaveLength(6);
      expect(labels).toEqual({
        matchId: 'BR1_3200579475',
        split: 'test',
        team100Win: 1,
      });
      for (const feature of features) {
        expect(Object.keys(feature).sort()).toEqual(
          [
            'bounds',
            'featureVersion',
            'horizonMs',
            'matchId',
            'reasons',
            'sourceMaxTimestampMs',
            'split',
            'values',
            'window',
            'windowStartMs',
          ].sort(),
        );
        expect(Object.keys(feature.values).sort()).toEqual(
          [...FEATURE_NAMES].sort(),
        );
        expect(feature.sourceMaxTimestampMs).toBeLessThanOrEqual(
          feature.horizonMs,
        );
        expect(feature.split).toBe(
          splitForMatch(metadata.gameCreation, protocol().split),
        );
      }
      expect(metadata.persistedProcessedAt).toBeNull();
      expect(metadata.lineage.status).toBe('unknown');
      expect(stableJson(features)).not.toMatch(
        /visionScore|gameDuration|team100Win|populationEligible|finalStats|processedAt/,
      );
      expect(() =>
        runVisionStudy(
          root,
          join(root, 'docs/analysis/corpus-manifest.json'),
          join(root, 'docs/analysis/met22-protocol.json'),
          one,
        ),
      ).toThrow('must be new');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
