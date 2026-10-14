#!/usr/bin/env node
/** Offline Match-V5 audit. Independent summary/timeline reconciliation;
 * controlled synthetic variants test failures, never increase real N. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KNOWN_WARDS = new Set([
  'YELLOW_TRINKET',
  'BLUE_TRINKET',
  'SIGHT_WARD',
  'CONTROL_WARD',
]);
const KNOWN_EVENTS = new Set([
  'ASCENDED_EVENT',
  'BUILDING_KILL',
  'CHAMPION_KILL',
  'CHAMPION_SPECIAL_KILL',
  'CHAMPION_TRANSFORM',
  'DRAGON_SOUL_GIVEN',
  'ELITE_MONSTER_KILL',
  'GAME_END',
  'ITEM_DESTROYED',
  'ITEM_PURCHASED',
  'ITEM_SOLD',
  'ITEM_UNDO',
  'LEVEL_UP',
  'OBJECTIVE_BOUNTY_FINISH',
  'OBJECTIVE_BOUNTY_PRESTART',
  'PAUSE_END',
  'SKILL_LEVEL_UP',
  'TURRET_PLATE_DESTROYED',
  'WARD_KILL',
  'WARD_PLACED',
]);
const OBJECTIVES = {
  DRAGON: 'dragon',
  BARON_NASHOR: 'baron',
  HORDE: 'horde',
  RIFTHERALD: 'riftHerald',
  TOWER_BUILDING: 'tower',
  INHIBITOR_BUILDING: 'inhibitor',
};
const OPTIONAL_FIELDS = [
  'wardsPlaced',
  'wardsKilled',
  'detectorWardsPlaced',
  'visionWardsBoughtInGame',
  'totalHealsOnTeammates',
  'totalDamageShieldedOnTeammates',
  'timePlayed',
  'gameEndedInSurrender',
  'gameEndedInEarlySurrender',
  'roleBoundItem',
  'challenges.soloKills',
];
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const get = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : null);
const numeric = (value) =>
  typeof value === 'number' || typeof value === 'boolean';
const plus = (a, b) =>
  numeric(a) && numeric(b) ? Number(a) + Number(b) : null;
const canonicalRole = (value) =>
  value === 'MID'
    ? 'MIDDLE'
    : ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(value)
      ? value
      : null;
const count = (values) => {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
};
const sortedObject = (counts) =>
  Object.fromEntries(
    [...counts].sort(([a], [b]) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    ),
  );
const sumMatching = (values, predicate) => values.filter(predicate).length;
export function field(object, path) {
  for (const part of path.split('.')) {
    if (
      !object ||
      typeof object !== 'object' ||
      Array.isArray(object) ||
      !Object.hasOwn(object, part)
    )
      return null;
    object = object[part];
  }
  return object;
}
function check(subject, metric, expectedSummary, observedTimeline) {
  return {
    subject,
    metric,
    expectedSummary,
    observedTimeline,
    status:
      expectedSummary === null || observedTimeline === null
        ? 'unavailable'
        : expectedSummary === observedTimeline
          ? 'pass'
          : 'fail',
  };
}
export function audit(match, timeline) {
  const participants = match.info?.participants ?? [],
    frames = timeline.info?.frames ?? [];
  const events = frames.flatMap((frame, fi) =>
    (frame.events ?? []).map((event, ei) => ({
      ...event,
      sourceFrameIndex: fi,
      sourceEventIndex: ei,
    })),
  );
  const kills = events.filter((e) => e.type === 'CHAMPION_KILL');
  const wards = events.filter(
    (e) => e.type === 'WARD_PLACED' && KNOWN_WARDS.has(e.wardType),
  );
  const clears = events.filter((e) => e.type === 'WARD_KILL');
  const validFrames = frames
    .map((f, i) => [i, f])
    .filter(([, f]) => numeric(f.timestamp));
  const final =
    [...validFrames].sort(
      ([i, a], [j, b]) => b.timestamp - a.timestamp || j - i,
    )[0]?.[1] ?? {};
  const playerChecks = [];
  for (const p of participants) {
    const pid = get(p, 'participantId'),
      last = final.participantFrames?.[String(pid)] ?? {};
    const observed = {
      kills: sumMatching(kills, (e) => get(e, 'killerId') === pid),
      deaths: sumMatching(kills, (e) => get(e, 'victimId') === pid),
      assists: sumMatching(kills, (e) =>
        (e.assistingParticipantIds ?? []).includes(pid),
      ),
      wardsPlaced: sumMatching(wards, (e) => get(e, 'creatorId') === pid),
      wardsKilled: sumMatching(clears, (e) => get(e, 'killerId') === pid),
      controlWards: sumMatching(
        wards,
        (e) => get(e, 'creatorId') === pid && e.wardType === 'CONTROL_WARD',
      ),
      soloKills: sumMatching(
        kills,
        (e) => get(e, 'killerId') === pid && !e.assistingParticipantIds?.length,
      ),
      finalGold: get(last, 'totalGold'),
      finalCS: plus(
        get(last, 'minionsKilled'),
        get(last, 'jungleMinionsKilled'),
      ),
      finalDamage: field(last, 'damageStats.totalDamageDoneToChampions'),
    };
    const expected = Object.fromEntries(
      ['kills', 'deaths', 'assists', 'wardsPlaced', 'wardsKilled'].map((k) => [
        k,
        get(p, k),
      ]),
    );
    Object.assign(expected, {
      controlWards: get(p, 'detectorWardsPlaced'),
      soloKills: field(p, 'challenges.soloKills'),
      finalGold: get(p, 'goldEarned'),
      finalCS: plus(
        get(p, 'totalMinionsKilled'),
        get(p, 'neutralMinionsKilled'),
      ),
      finalDamage: get(p, 'totalDamageDealtToChampions'),
    });
    for (const metric of Object.keys(observed))
      playerChecks.push(
        check(
          pid,
          metric,
          expected[metric],
          frames.length ? observed[metric] : null,
        ),
      );
  }
  const objectives = new Map(),
    unknownObjectiveTeamEvidence = [];
  for (const e of events) {
    if (!['ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(e.type)) continue;
    const building = e.type === 'BUILDING_KILL';
    const team = building
      ? [100, 200].includes(e.teamId)
        ? 300 - e.teamId
        : null
      : get(e, 'killerTeamId');
    if (![100, 200].includes(team)) {
      unknownObjectiveTeamEvidence.push([
        e.sourceFrameIndex,
        e.sourceEventIndex,
      ]);
      continue;
    }
    const key = JSON.stringify([
      team,
      get(e, building ? 'buildingType' : 'monsterType'),
    ]);
    objectives.set(key, (objectives.get(key) ?? 0) + 1);
  }
  const objectiveChecks = (match.info?.teams ?? []).flatMap((team) =>
    Object.entries(OBJECTIVES).map(([kind, summary]) =>
      check(
        team.teamId,
        kind,
        field(team, `objectives.${summary}.kills`),
        frames.length
          ? (objectives.get(JSON.stringify([team.teamId, kind])) ?? 0)
          : null,
      ),
    ),
  );
  const timestamps = validFrames.map(([, f]) => f.timestamp);
  const minuteCounts = count(timestamps.map((ts) => Math.floor(ts / 60000)));
  const eventTypes = count(
    events.map((e) => (Object.hasOwn(e, 'type') ? e.type : 'MISSING_TYPE')),
  );
  const unknownWards = count(
    events
      .filter((e) => e.type === 'WARD_PLACED' && !KNOWN_WARDS.has(e.wardType))
      .map((e) => (Object.hasOwn(e, 'wardType') ? e.wardType : 'MISSING_TYPE')),
  );
  const durationMs = (match.info?.gameDuration ?? 0) * 1000;
  const endEvents = events
    .filter((e) => e.type === 'GAME_END' && numeric(e.timestamp))
    .map((e) => e.timestamp);
  const endMs = endEvents.length ? Math.max(...endEvents) : durationMs;
  const checkpoints = [];
  for (const target of [300000, 600000, 900000, 1200000])
    for (const mode of ['nearest', 'pastOnly']) {
      const choices = validFrames.filter(
        ([, f]) =>
          f.timestamp >= 0 &&
          f.timestamp <= endMs &&
          Math.abs(f.timestamp - target) <= 60000 &&
          (mode !== 'pastOnly' || f.timestamp <= target),
      );
      choices.sort(
        ([i, a], [j, b]) =>
          Math.abs(a.timestamp - target) - Math.abs(b.timestamp - target) ||
          a.timestamp - b.timestamp ||
          i - j,
      );
      const selected = choices.length && target <= endMs ? choices[0] : null;
      checkpoints.push({
        targetMs: target,
        mode,
        toleranceMs: 60000,
        frameIndex: selected ? selected[0] : null,
        timestampMs: selected ? selected[1].timestamp : null,
        offsetMs: selected ? selected[1].timestamp - target : null,
        reason: selected
          ? null
          : target > endMs
            ? 'short_match'
            : 'missing_frame',
      });
    }
  const opponents = participants.map((p) => {
    const role = canonicalRole(p.teamPosition);
    const eligible = participants.filter(
      (q) =>
        [100, 200].includes(q.teamId) &&
        [100, 200].includes(p.teamId) &&
        q.teamId !== p.teamId &&
        role &&
        canonicalRole(q.teamPosition) === role,
    );
    return {
      participantId: get(p, 'participantId'),
      originalRole: get(p, 'teamPosition'),
      canonicalRole: role,
      opponentId: eligible.length === 1 ? eligible[0].participantId : null,
      reason:
        eligible.length === 1
          ? null
          : eligible.length > 1 || role === null
            ? 'ambiguous_role'
            : 'missing_opponent',
    };
  });
  const checks = [...playerChecks, ...objectiveChecks],
    expectedIds = new Set(participants.map((p) => get(p, 'puuid')));
  const timelineIds = new Set(timeline.metadata?.participants ?? []),
    sortedTimes = [...timestamps].sort((a, b) => a - b),
    integrityIssues = [];
  if (field(match, 'metadata.matchId') !== field(timeline, 'metadata.matchId'))
    integrityIssues.push('match_id_mismatch');
  if (
    expectedIds.size !== timelineIds.size ||
    [...expectedIds].some((id) => !timelineIds.has(id))
  )
    integrityIssues.push('participant_identity_mismatch');
  if (timestamps.some((ts, i) => ts !== sortedTimes[i]))
    integrityIssues.push('frame_order_mismatch');
  if (timestamps.length !== frames.length)
    integrityIssues.push('missing_frame_timestamp');
  return {
    matchId: field(match, 'metadata.matchId'),
    context: Object.fromEntries(
      ['gameVersion', 'queueId', 'mapId', 'gameDuration'].map((k) => [
        k,
        field(match, `info.${k}`),
      ]),
    ),
    playerChecks,
    objectiveChecks,
    summary: {
      playerChecks: playerChecks.length,
      objectiveChecks: objectiveChecks.length,
      ...Object.fromEntries(
        ['pass', 'fail', 'unavailable'].map((state) => [
          state,
          sumMatching(checks, (c) => c.status === state),
        ]),
      ),
    },
    integrityIssues,
    coverage: {
      frames: frames.length,
      snapshots: frames.reduce(
        (n, f) => n + Object.keys(f.participantFrames ?? {}).length,
        0,
      ),
      frameTimestampMs: timestamps,
      duplicateMinutes: Object.fromEntries(
        [...minuteCounts].filter(([, n]) => n > 1).sort(([a], [b]) => a - b),
      ),
      duplicateTimestamps: Object.fromEntries(
        [...count(timestamps)].filter(([, n]) => n > 1),
      ),
      gapsOverToleranceMs: sortedTimes
        .slice(1)
        .flatMap((b, i) =>
          b - sortedTimes[i] > 120000 ? [[sortedTimes[i], b]] : [],
        ),
      optionalFields: Object.fromEntries(
        OPTIONAL_FIELDS.map((k) => [
          k,
          {
            present: sumMatching(participants, (p) => field(p, k) !== null),
            total: participants.length,
          },
        ]),
      ),
      eventTypes: sortedObject(eventTypes),
      unknownEventTypes: sortedObject(
        new Map([...eventTypes].filter(([k]) => !KNOWN_EVENTS.has(k))),
      ),
      recognizedWardPlacements: wards.length,
      unknownWardTypes: sortedObject(unknownWards),
      unknownObjectiveTeamEvidence,
    },
    checkpoints,
    opponents,
    surrender: {
      flags: participants.map((p) => get(p, 'gameEndedInSurrender')),
      earlyFlags: participants.map((p) => get(p, 'gameEndedInEarlySurrender')),
      caution:
        'Surrender is not remake; positive remake rules require separate patch validation.',
    },
  };
}

export function* variations(match, timeline) {
  for (const name of [
    'missing_frames',
    'duplicate_timestamp',
    'unknown_types',
    'ambiguous_role',
    'short_match',
    'surrender_false',
    'early_surrender',
    'missing_optional',
    'unsupported_patch',
  ]) {
    const m = structuredClone(match),
      t = structuredClone(timeline);
    if (name === 'missing_frames')
      t.info.frames = t.info.frames.filter(
        (f) => !(f.timestamp >= 780000 && f.timestamp <= 1020000),
      );
    else if (name === 'duplicate_timestamp') {
      const duplicate = structuredClone(t.info.frames[15]);
      duplicate.events = [];
      t.info.frames.splice(16, 0, duplicate);
    } else if (name === 'unknown_types')
      t.info.frames[1].events.push(
        { type: 'FUTURE_EVENT', timestamp: 60000 },
        {
          type: 'WARD_PLACED',
          wardType: 'FUTURE_WARD',
          creatorId: 1,
          timestamp: 60000,
        },
      );
    else if (name === 'ambiguous_role')
      m.info.participants[6].teamPosition = 'TOP';
    else if (name === 'short_match') {
      m.info.gameDuration = 120;
      t.info.frames = t.info.frames.filter((f) => f.timestamp <= 120000);
    } else if (name === 'surrender_false' || name === 'early_surrender')
      for (const p of m.info.participants) {
        p.gameEndedInSurrender = name === 'early_surrender';
        p.gameEndedInEarlySurrender = name === 'early_surrender';
      }
    else if (name === 'missing_optional') {
      const p = m.info.participants[0];
      for (const key of OPTIONAL_FIELDS) if (!key.includes('.')) delete p[key];
      delete p.challenges.soloKills;
      delete t.info.frames.at(-1).participantFrames['1'].totalGold;
    } else if (name === 'unsupported_patch') m.info.gameVersion = '16.20.999.1';
    yield [name, m, t];
  }
}
export function syntheticAssertions(name, result) {
  if (name === 'missing_frames')
    return result.checkpoints
      .filter((c) => c.targetMs === 900000)
      .every((c) => c.reason === 'missing_frame');
  if (name === 'duplicate_timestamp')
    return (
      result.coverage.frames === 42 &&
      result.coverage.snapshots === 420 &&
      JSON.stringify(result.coverage.duplicateTimestamps) === '{"900358":2}' &&
      result.summary.fail === 0
    );
  if (name === 'unknown_types')
    return (
      result.coverage.unknownEventTypes.FUTURE_EVENT === 1 &&
      result.coverage.unknownWardTypes.FUTURE_WARD === 1 &&
      result.summary.fail === 0
    );
  if (name === 'ambiguous_role')
    return (
      result.opponents[0].reason === 'ambiguous_role' &&
      result.opponents[1].reason === 'missing_opponent'
    );
  if (name === 'short_match')
    return (
      result.checkpoints.every((c) => c.reason === 'short_match') &&
      result.summary.fail > 0
    );
  if (name === 'surrender_false')
    return (
      !result.surrender.flags.some(Boolean) &&
      !result.surrender.earlyFlags.some(Boolean)
    );
  if (name === 'early_surrender')
    return result.surrender.earlyFlags.every(Boolean);
  if (name === 'missing_optional')
    return (
      result.coverage.optionalFields.wardsPlaced.present === 9 &&
      result.playerChecks.some(
        (c) =>
          c.metric === 'finalGold' &&
          c.subject === 1 &&
          c.status === 'unavailable',
      )
    );
  if (name === 'unsupported_patch')
    return result.context.gameVersion === '16.20.999.1';
  return false;
}
export function buildReport(manifestPath, matchRawEvidence = null) {
  manifestPath = resolve(manifestPath);
  const manifestRelative = relative(ROOT, manifestPath);
  if (manifestRelative.startsWith('../') || isAbsolute(manifestRelative))
    throw new Error('Manifest must be inside the repository root');
  const manifest = load(manifestPath),
    real = [],
    synthetic = [],
    hashes = {};
  for (const entry of manifest.realSamples) {
    const paths = [resolve(ROOT, entry.summary), resolve(ROOT, entry.timeline)],
      [match, timeline] = paths.map(load);
    for (const path of paths)
      hashes[relative(ROOT, path)] = createHash('sha256')
        .update(readFileSync(path))
        .digest('hex');
    real.push({
      sampleId: entry.id,
      kind: 'real',
      audit: audit(match, timeline),
    });
    if (entry.generateSynthetic)
      for (const [name, m, t] of variations(match, timeline)) {
        const result = audit(m, t),
          passed = syntheticAssertions(name, result);
        result.playerChecks = result.playerChecks.filter(
          (c) => c.status !== 'pass',
        );
        result.objectiveChecks = result.objectiveChecks.filter(
          (c) => c.status !== 'pass',
        );
        synthetic.push({
          sampleId: `${entry.id}:${name}`,
          kind: 'synthetic',
          derivedFrom: entry.id,
          mutation: name,
          expectationPassed: passed,
          audit: result,
        });
      }
  }
  const groups = count(
    real.map((r) =>
      JSON.stringify([
        r.audit.context.gameVersion,
        r.audit.context.queueId,
        r.audit.context.mapId,
      ]),
    ),
  );
  const coverageByVersionQueueMap = [...groups]
    .map(([key, realN]) => {
      const [gameVersion, queueId, mapId] = JSON.parse(key);
      return {
        gameVersion,
        patch: gameVersion.split('.').slice(0, 2).join('.'),
        queueId,
        mapId,
        realN,
      };
    })
    .sort((a, b) =>
      a.gameVersion < b.gameVersion
        ? -1
        : a.gameVersion > b.gameVersion
          ? 1
          : a.queueId - b.queueId || a.mapId - b.mapId,
    );
  return {
    auditVersion: 1,
    manifest: manifestRelative,
    sourceSha256: hashes,
    realSampleN: real.length,
    syntheticSampleN: synthetic.length,
    coverageByVersionQueueMap,
    supportMatrix: manifest.supportMatrix,
    matchRawAvailability:
      matchRawEvidence && Object.keys(matchRawEvidence).length
        ? matchRawEvidence
        : {
            status: 'not_measured',
            scope: 'No database queried by offline auditor',
            rows: null,
            summaryAvailable: null,
            timelineAvailable: null,
            limitation:
              'Repository fixture count does not establish database or production coverage.',
          },
    limitations: [
      'Only one real patch currently checked in; synthetic variants do not establish cross-patch support.',
      'No population representativeness or full BR server coverage is claimed.',
      'Truncated synthetic timelines intentionally produce reconciliation failures; expectationPassed tests that they are detected.',
    ],
    real,
    synthetic,
  };
}
export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      manifest: {
        type: 'string',
        default: resolve(ROOT, 'docs/analysis/corpus-manifest.json'),
      },
      output: {
        type: 'string',
        default: resolve(ROOT, 'docs/analysis/corpus-audit.json'),
      },
      'match-raw-evidence': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: node scripts/validation/audit-metrics-corpus.mjs [--manifest PATH] [--output PATH] [--match-raw-evidence PATH]\nOffline Match-V5 audit; no network or database writes.',
    );
    return 0;
  }
  const report = buildReport(
    values.manifest,
    values['match-raw-evidence'] ? load(values['match-raw-evidence']) : null,
  );
  mkdirSync(dirname(values.output), { recursive: true });
  writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
  const failures =
    report.real.reduce(
      (n, r) => n + r.audit.summary.fail + r.audit.integrityIssues.length,
      0,
    ) + report.synthetic.filter((r) => !r.expectationPassed).length;
  console.log(
    JSON.stringify({
      realN: report.realSampleN,
      syntheticN: report.syntheticSampleN,
      unexpectedFailures: failures,
      output: values.output,
    }),
  );
  return failures ? 1 : 0;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = main();
