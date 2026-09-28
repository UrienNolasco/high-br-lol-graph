/** Offline, read-only source audit. No database, HTTP, training service or application bootstrap. */
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { MatchDto } from '../../core/riot/dto/match.dto';
import { TimelineDto } from '../../core/riot/dto/timeline.dto';
import { normalizeTimelineEvents } from '../../modules/matches/adapters/riot/normalized-events';
import { projectTimelineSnapshots } from '../../modules/matches/adapters/riot/timeline-snapshots';
import { parseMatchData } from '../../modules/matches/adapters/riot/match.parser';
import { DATASET_VERSION } from '../../modules/dataset/contracts/definition';
import { PROCESSING_VERSION } from '../../core/processing/processing.constants';
import {
  datasetDigest,
  stableJson,
} from '../../modules/dataset/contracts/serialization';
import {
  splitForMatch,
  validateTemporalSplit,
} from '../../modules/dataset/contracts/temporal-split';
import {
  describeStudy,
  extractVisionFeatures,
  independentSamples,
  recognizedWard,
  STUDY_HORIZONS,
  STUDY_WINDOWS,
  StudyProtocol,
  StudySample,
  VISION_STUDY_VERSION,
} from './vision-study';

interface CorpusEntry {
  id: string;
  summary: string;
  timeline: string;
  sourceKind?: 'real' | 'synthetic';
}
export function validateStudyProtocol(value: StudyProtocol) {
  if (
    value.version !== 1 ||
    value.queueId !== 420 ||
    value.mapId !== 11 ||
    !/^\d+\.\d+$/.test(value.patch)
  )
    throw new Error(
      'Protocol requires version1, exact patch, Solo/Duo420, map11',
    );
  validateTemporalSplit(value.split);
  const thresholds = value.thresholds;
  for (const key of [
    'minimumMatches',
    'minimumTrain',
    'minimumValidation',
    'minimumTest',
    'minimumClassPerSplit',
  ] as const)
    if (!Number.isSafeInteger(thresholds?.[key]) || thresholds[key] < 1)
      throw new Error(`Invalid model gate ${key}`);
  for (const key of [
    'minimumFeatureCoverage',
    'minimumRecognizedWardFraction',
  ] as const)
    if (
      !Number.isFinite(thresholds[key]) ||
      thresholds[key] <= 0 ||
      thresholds[key] > 1
    )
      throw new Error(`Invalid model gate ${key}`);
  return value;
}
export function studySource(
  summary: MatchDto,
  timeline: TimelineDto,
  sourceKind: 'real' | 'synthetic' = 'real',
) {
  if (
    !summary.metadata?.matchId ||
    summary.metadata.matchId !== timeline.metadata?.matchId
  )
    throw new Error('Summary/timeline match identity mismatch');
  const parsed = parseMatchData(summary);
  const players = summary.info.participants.map((p) => ({
    participantId: p.participantId,
    puuid: p.puuid,
    teamId: p.teamId,
  }));
  const puuids = new Map(players.map((p) => [p.participantId, p.puuid]));
  const teams = new Map(players.map((p) => [p.participantId, p.teamId]));
  if (
    !Number.isSafeInteger(summary.info.gameCreation) ||
    summary.info.gameCreation < 0
  )
    throw new Error('Invalid chronological match identity');
  const events = normalizeTimelineEvents(timeline, puuids, teams, {
    processingVersion: PROCESSING_VERSION,
  });
  const projection = projectTimelineSnapshots(timeline, puuids);
  const input = {
    matchId: summary.metadata.matchId,
    participants: players,
    events,
    projection,
    processingVersion: PROCESSING_VERSION,
  };
  const results = STUDY_HORIZONS.flatMap((horizon) =>
    STUDY_WINDOWS.map((window) =>
      extractVisionFeatures(input, horizon, window),
    ),
  );
  // Match IDs, timestamps in the summary and outcome changes do not make replayed timeline observations independent.
  const sourceFingerprint = datasetDigest(
    stableJson({
      timelineInfo: timeline.info,
      roster: [...players].sort((a, b) => a.participantId - b.participantId),
    }),
  );
  const observedTeams = summary.info.teams;
  const labelValid =
    observedTeams.length === 2 &&
    [100, 200].every(
      (id) => observedTeams.filter((t) => t.teamId === id).length === 1,
    ) &&
    observedTeams.every((t) => typeof t.win === 'boolean') &&
    observedTeams.filter((t) => t.win).length === 1;
  const sample: StudySample = {
    matchId: input.matchId,
    sourceFingerprint,
    sourceKind,
    gameCreation: summary.info.gameCreation,
    patch: /^\d+\.\d+/.exec(summary.info.gameVersion)?.[0] ?? null,
    queueId: summary.info.queueId,
    mapId: summary.info.mapId,
    playerIds: [...new Set(players.map((p) => p.puuid))].sort(),
    populationEligible: parsed.match.populationEligible,
    exclusionReason: parsed.match.populationExclusionReason,
    team100Win: labelValid
      ? Number(observedTeams.find((t) => t.teamId === 100)!.win)
      : null,
    results,
  };
  const wards = events.filter(
    (e) => e.type === 'WARD_PLACED' || e.type === 'WARD_KILL',
  );
  const terminal = events.filter(
    (e) => e.type === 'GAME_END' && e.timestampMs !== null,
  );
  const complete =
    terminal.length === 1 &&
    wards.every(
      (e) =>
        e.timestampMs !== null &&
        e.timestampMs >= 0 &&
        e.timestampMs <= terminal[0].timestampMs! &&
        e.actorPuuid !== null &&
        sample.playerIds.includes(e.actorPuuid),
    );
  const reconciliation = summary.info.participants.flatMap((player) =>
    (['WARD_PLACED', 'WARD_KILL'] as const).map((type) => {
      const raw =
        type === 'WARD_PLACED' ? player.wardsPlaced : player.wardsKilled;
      const expected =
        typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
          ? raw
          : null;
      const registered = wards.filter(
        (e) =>
          e.type === type && e.actorPuuid === player.puuid && recognizedWard(e),
      );
      const observed = complete ? registered.length : null;
      return {
        participantId: player.participantId,
        type,
        expectedSummary: expected,
        observedRecognizedTimeline: observed,
        status:
          expected === null || observed === null
            ? 'unavailable'
            : expected === observed
              ? 'pass'
              : 'mismatch',
      };
    }),
  );
  return {
    sample,
    audit: {
      matchId: sample.matchId,
      labelReason: labelValid ? null : 'unknown_or_ambiguous_team_outcome',
      registeredPlacements: wards.filter((e) => e.type === 'WARD_PLACED')
        .length,
      recognizedPlacements: wards.filter(
        (e) => e.type === 'WARD_PLACED' && recognizedWard(e),
      ).length,
      unknownPlacements: wards.filter(
        (e) => e.type === 'WARD_PLACED' && !recognizedWard(e),
      ).length,
      registeredRemovals: wards.filter((e) => e.type === 'WARD_KILL').length,
      recognizedRemovals: wards.filter(
        (e) => e.type === 'WARD_KILL' && recognizedWard(e),
      ).length,
      unknownRemovals: wards.filter(
        (e) => e.type === 'WARD_KILL' && !recognizedWard(e),
      ).length,
      reconciliation,
      policy:
        'Final-source diagnostic only; never used to create or gate prefix feature values.',
    },
  };
}

export function runVisionStudy(
  root: string,
  corpusPath: string,
  protocolPath: string,
  out: string,
) {
  const protocolText = readFileSync(protocolPath, 'utf8');
  const protocol = validateStudyProtocol(JSON.parse(protocolText));
  const corpusText = readFileSync(corpusPath, 'utf8');
  const corpus = JSON.parse(corpusText) as { realSamples: CorpusEntry[] };
  if (!Array.isArray(corpus.realSamples))
    throw new Error('Corpus must declare realSamples explicitly');
  const sources = corpus.realSamples.map((entry) => {
    const summaryText = readFileSync(resolve(root, entry.summary), 'utf8');
    const timelineText = readFileSync(resolve(root, entry.timeline), 'utf8');
    const result = studySource(
      JSON.parse(summaryText),
      JSON.parse(timelineText),
      entry.sourceKind ?? 'real',
    );
    if (entry.id !== result.sample.matchId)
      throw new Error('Manifest/source match identity mismatch');
    return {
      ...result,
      files: {
        summary: { path: entry.summary, sha256: datasetDigest(summaryText) },
        timeline: { path: entry.timeline, sha256: datasetDigest(timelineText) },
      },
    };
  });
  const independent = independentSamples(sources.map((s) => s.sample));
  const results = describeStudy(
    sources.map((s) => s.sample),
    protocol,
  );
  const features = independent.samples.flatMap((sample) =>
    sample.results.map((result) => ({
      ...result.features,
      split: splitForMatch(sample.gameCreation, protocol.split),
    })),
  );
  const labels = independent.samples.map((sample) => ({
    matchId: sample.matchId,
    team100Win: sample.team100Win,
    split: splitForMatch(sample.gameCreation, protocol.split),
  }));
  const metadata = independent.samples.map((sample) => ({
    matchId: sample.matchId,
    sourceFingerprint: sample.sourceFingerprint,
    sourceKind: sample.sourceKind,
    gameCreation: sample.gameCreation,
    patch: sample.patch,
    queueId: sample.queueId,
    mapId: sample.mapId,
    playerIds: sample.playerIds,
    populationEligible: sample.populationEligible,
    exclusionReason: sample.exclusionReason,
    projectedByProcessingCodeVersion: PROCESSING_VERSION,
    persistedProcessedAt: null,
    lineage: {
      status: 'unknown',
      reason: 'repository_fixture_has_no_discovery_observation',
    },
    retrospectiveRoleAndRankPolicy:
      'Summary role and discovery rank are not known-at-horizon covariates; neither is exported as a feature.',
    coverage: sample.results.map((r) => ({
      horizonMs: r.features.horizonMs,
      window: r.features.window,
      ...r.coverage,
    })),
  }));
  const jsonl = (rows: unknown[]) =>
    rows.length ? rows.map(stableJson).join('\n') + '\n' : '';
  const files = {
    'features.jsonl': jsonl(features),
    'labels.jsonl': jsonl(labels),
    'metadata.jsonl': jsonl(metadata),
    'results.json': JSON.stringify(results, null, 2) + '\n',
    'reconciliation.json':
      JSON.stringify(
        sources.map((s) => s.audit),
        null,
        2,
      ) + '\n',
  };
  const sourceFiles = [
    'src/studies/vision/vision-study.ts',
    'src/studies/vision/entrypoint.ts',
    'src/modules/matches/adapters/riot/normalized-events.ts',
    'src/modules/matches/adapters/riot/timeline-snapshots.ts',
    'src/modules/matches/contracts/snapshot-readers.ts',
    'src/modules/matches/contracts/temporal.ts',
    'src/modules/matches/pure/vision-calculator.ts',
    'src/modules/matches/adapters/riot/match.parser.ts',
    'src/modules/matches/contracts/champion-population.ts',
    'src/modules/matches/contracts/eligibility.ts',
    'src/core/processing/processing.constants.ts',
    'src/modules/dataset/contracts/serialization.ts',
    'src/modules/dataset/contracts/temporal-split.ts',
  ];
  const manifest = {
    task: 'MET-22',
    metricId: 'H03',
    researchVersion: VISION_STUDY_VERSION,
    datasetFoundationVersion: DATASET_VERSION,
    protocol,
    protocolSha256: datasetDigest(protocolText),
    corpusManifestSha256: datasetDigest(corpusText),
    sourceScope:
      'Explicit repository corpus only. No database, benchmark replicas, network or production data queried.',
    sourceFiles: sources.map((s) => ({
      matchId: s.sample.matchId,
      fingerprint: s.sample.sourceFingerprint,
      ...s.files,
    })),
    implementationSha256: Object.fromEntries(
      sourceFiles.map((path) => [
        path,
        datasetDigest(readFileSync(resolve(root, path), 'utf8')),
      ]),
    ),
    provenance:
      'Offline transformations using processing generation4 code, not a completed persisted generation; processedAt and discovery lineage are unknown.',
    featurePolicy:
      'Only timestamped observations <= horizon; identifiers/window/split are metadata, not model covariates. Explicit numeric baseline/augmented allowlists in results. Outcome only in labels; final checks only in reconciliation.',
    featureDefinitions: {
      direction: 'team100 minus team200',
      goldDiff:
        'sum of five participant totalGold per team in same pastOnly frame, tolerance60000ms',
      killDiff:
        'attributed CHAMPION_KILL events; explicit environmental killer0 contributes no team kill',
      towerDiff:
        'TOWER_BUILDING captures by beneficiary team, never destroyed owner',
      recognizedPlacementDiff: 'WARD_PLACED with MET11 recognized wardType',
      recognizedRemovalDiff: 'WARD_KILL with MET11 recognized wardType',
      controlPlacementDiff:
        'WARD_PLACED literal CONTROL_WARD; subset of recognized placements',
      unknownPlacementDiff:
        'WARD_PLACED with missing/future/unknown type, separately observed',
      unknownRemovalDiff:
        'WARD_KILL with missing/future/unknown type, separately observed',
      zeroAndMissing:
        'Complete timestamp/actor/frame source with zero events is zero. Unsupported projection, missing source, ambiguous identity or attribution is null with reason.',
    },
    independentMatches: independent.samples.length,
    featureRows: features.length,
    labelRows: labels.length,
    files: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        { bytes: Buffer.byteLength(content), sha256: datasetDigest(content) },
      ]),
    ),
  };
  if (existsSync(out)) throw new Error('Study output destination must be new');
  const stage = resolve(
    dirname(out),
    `.${basename(out)}.building-${process.pid}`,
  );
  mkdirSync(stage);
  try {
    for (const [name, content] of Object.entries(files))
      writeFileSync(resolve(stage, name), content, { flag: 'wx' });
    writeFileSync(
      resolve(stage, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' },
    );
    renameSync(stage, out);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return {
    out,
    independentMatches: independent.samples.length,
    conclusion: results.conclusion,
  };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const option = (key: string, fallback?: string) => {
      const index = args.indexOf(key);
      if (index < 0) {
        if (fallback) return fallback;
        throw new Error(`Required ${key}`);
      }
      if (!args[index + 1] || args[index + 1].startsWith('--'))
        throw new Error(`Missing value for ${key}`);
      return args[index + 1];
    };
    const root = resolve(__dirname, '../../..');
    if (
      args.some(
        (arg, index) =>
          index % 2 === 0 && !['--corpus', '--protocol', '--out'].includes(arg),
      )
    )
      throw new Error('Unknown option');
    console.log(
      JSON.stringify(
        runVisionStudy(
          root,
          resolve(option('--corpus', 'docs/analysis/corpus-manifest.json')),
          resolve(option('--protocol', 'docs/analysis/met22-protocol.json')),
          resolve(option('--out')),
        ),
      ),
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
