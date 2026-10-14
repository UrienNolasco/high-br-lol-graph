#!/usr/bin/env node
/** Offline validation against 120 original observations. Never emits player identifiers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const HASH = (bytes) => createHash('sha256').update(bytes).digest('hex');
const valid = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const role = (x) => (x === 'MID' ? 'MIDDLE' : x);
const resourceFields = {
  gold: 'totalGold',
  xp: 'xp',
  laneCs: 'minionsKilled',
  jungleCs: 'jungleMinionsKilled',
};
const near = (actual, expected, label) => {
  if (expected === null) assert.equal(actual, null, label);
  else
    assert.ok(
      typeof actual === 'number' &&
        Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
      label,
    );
};

export function validateIdentity(summary, timeline, matchId) {
  assert.equal(summary.metadata.matchId, matchId, 'summary match identity');
  assert.equal(timeline.metadata.matchId, matchId, 'timeline match identity');
  const s = summary.info.participants,
    t = timeline.info.participants;
  assert.equal(s.length, 10, 'summary roster cardinality');
  assert.equal(t.length, 10, 'timeline roster cardinality');
  assert.equal(
    new Set(s.map((p) => p.participantId)).size,
    10,
    'summary participant IDs unique',
  );
  assert.equal(
    new Set(s.map((p) => p.puuid)).size,
    10,
    'summary identities unique',
  );
  assert.equal(
    new Set(t.map((p) => p.participantId)).size,
    10,
    'timeline participant IDs unique',
  );
  assert.equal(
    new Set(t.map((p) => p.puuid)).size,
    10,
    'timeline identities unique',
  );
  assert.ok(
    s.every(
      (p) =>
        Number.isSafeInteger(p.participantId) &&
        p.participantId > 0 &&
        typeof p.puuid === 'string' &&
        p.puuid.length > 0,
    ),
    'explicit valid identities',
  );
  const identities = new Map(t.map((p) => [p.participantId, p.puuid]));
  assert.ok(
    s.every((p) => identities.get(p.participantId) === p.puuid),
    'explicit summary/timeline identity match',
  );
  for (const team of [100, 200])
    assert.equal(
      s.filter((p) => p.teamId === team).length,
      5,
      'team roster cardinality',
    );
  return new Map(s.map((p) => [p.participantId, p.puuid]));
}
export function readPair(corpus, entry) {
  const pair = ['summary', 'timeline'].map((kind) => {
    const bytes = readFileSync(resolve(corpus, entry[kind]));
    assert.equal(
      HASH(bytes),
      entry[kind + 'Sha256'],
      `${entry.id}: ${kind} SHA-256`,
    );
    return JSON.parse(gunzipSync(bytes));
  });
  validateIdentity(...pair, entry.id);
  return pair;
}
const killEvents = (timeline, id) =>
  timeline.info.frames.flatMap((frame, fi) =>
    frame.events.flatMap((e, ei) =>
      e.type === 'CHAMPION_KILL'
        ? [{ ...e, eventId: `${id}:${fi}:${ei}`, fi, ei }]
        : [],
    ),
  );
const rawCounter = (frame, pid, key) => {
  const p = Object.values(frame.participantFrames).filter(
    (p) => p.participantId === pid,
  );
  if (p.length !== 1) return null;
  if (key === 'cs') {
    const a = p[0].minionsKilled,
      b = p[0].jungleMinionsKilled;
    return valid(a) && valid(b) ? a + b : null;
  }
  const value = p[0][resourceFields[key]];
  return valid(value) ? value : null;
};
const difference = (a, b) => (a === null || b === null ? null : a - b);
const increment = (a, b) => (a === null || b === null || b < a ? null : b - a);

/** Independent raw resource oracle, no imported production selector/arithmetic. */
export function rawResources(summary, timeline, death, pid) {
  const participant = summary.info.participants.find(
    (p) => p.participantId === pid,
  );
  const rolePeers = summary.info.participants.filter(
    (p) => role(p.teamPosition) === role(participant.teamPosition),
  );
  const allies = rolePeers.filter((p) => p.teamId === participant.teamId);
  const opponents = rolePeers.filter((p) => p.teamId !== participant.teamId);
  if (allies.length !== 1 || opponents.length !== 1)
    return { reason: 'ambiguous_role' };
  const opponent = opponents[0].participantId;
  const frames = timeline.info.frames;
  const end = frames
    .flatMap((f) => f.events)
    .filter((e) => e.type === 'GAME_END');
  assert.equal(end.length, 1, 'one original GAME_END');
  if (death.timestamp + 180000 > end[0].timestamp)
    return { reason: 'censored_followup' };
  const chosen = [];
  for (const [label, offset] of [
    ['baseline', -180000],
    ['before', 0],
    ['after', 180000],
  ]) {
    const target = death.timestamp + offset;
    let index = frames.length - 1;
    while (index >= 0 && frames[index].timestamp > target) index--;
    if (index < 0) return { reason: `${label}_missing_frame` };
    if (target - frames[index].timestamp > 60000)
      return { reason: `${label}_stale_frame` };
    chosen.push(index);
  }
  const [b, p, a] = chosen.map((i) => frames[i].timestamp);
  if (!(b < p && p < death.timestamp && death.timestamp < a))
    return { reason: 'invalid_observed_window' };
  const deaths = killEvents(timeline, summary.metadata.matchId).filter(
    (k) => k.victimId === pid,
  );
  const priorDeath = deaths.some((k) => b < k.timestamp && k.timestamp <= p);
  const repeatedDeath =
    deaths.filter((k) => p < k.timestamp && k.timestamp <= a).length !== 1;
  const metrics = {};
  for (const key of [...Object.keys(resourceFields), 'cs']) {
    const own = chosen.map((i) => rawCounter(frames[i], pid, key));
    const other = chosen.map((i) => rawCounter(frames[i], opponent, key));
    const ownPrior = increment(own[0], own[1]),
      ownPost = increment(own[1], own[2]);
    const opPrior = increment(other[0], other[1]),
      opPost = increment(other[1], other[2]);
    metrics[key] = {
      baselineLead: difference(own[0], other[0]),
      beforeLead: difference(own[1], other[1]),
      afterLead: difference(own[2], other[2]),
      focalPriorGain: ownPrior,
      focalPostGain: ownPost,
      opponentPriorGain: opPrior,
      opponentPostGain: opPost,
      priorRelativeGain: difference(ownPrior, opPrior),
      postRelativeGain: difference(ownPost, opPost),
    };
    const m = metrics[key];
    m.priorRelativePerMinute =
      m.priorRelativeGain === null
        ? null
        : m.priorRelativeGain / ((p - b) / 60000);
    m.postRelativePerMinute =
      m.postRelativeGain === null
        ? null
        : m.postRelativeGain / ((a - p) / 60000);
    m.relativeRateChange = difference(
      m.postRelativePerMinute,
      m.priorRelativePerMinute,
    );
  }
  return {
    reason: repeatedDeath
      ? 'repeated_death'
      : priorDeath
        ? 'prior_death'
        : null,
    chosen,
    timestamps: [b, p, a],
    priorDeath,
    repeatedDeath,
    metrics,
  };
}

export function rawDamage(summary, timeline) {
  const frames = timeline.info.frames,
    kills = killEvents(timeline, summary.metadata.matchId);
  const rows = [];
  for (let fi = 1; fi < frames.length; fi++) {
    const a = frames[fi - 1],
      b = frames[fi],
      duration = b.timestamp - a.timestamp;
    const personal = new Map();
    for (const p of summary.info.participants) {
      const read = (frame) =>
        Object.values(frame.participantFrames).find(
          (s) => s.participantId === p.participantId,
        )?.damageStats?.totalDamageDoneToChampions;
      const before = read(a),
        after = read(b);
      assert.ok(
        valid(before) && valid(after) && after >= before,
        'original damage counters complete and monotone',
      );
      personal.set(p.participantId, after - before);
    }
    const deaths = kills.filter(
      (e) => a.timestamp < e.timestamp && e.timestamp <= b.timestamp,
    );
    rows.push({
      fi,
      start: a.timestamp,
      end: b.timestamp,
      duration,
      personal,
      global: [...personal.values()].reduce((a, b) => a + b, 0),
      deaths,
      noDeaths: deaths.length === 0,
      next:
        kills
          .filter((e) => e.timestamp > b.timestamp)
          .sort((a, b) => a.timestamp - b.timestamp)[0] ?? null,
    });
  }
  return rows;
}
function validateDamage(report, participant, raw, kills, endMs, counts) {
  assert.equal(report.complete, true, 'full original damage reconciliation');
  assert.equal(
    report.intervals.length,
    raw.length,
    'all original intervals retained',
  );
  let sum = 0,
    silent = 0;
  for (let i = 0; i < raw.length; i++) {
    const expected = raw[i],
      actual = report.intervals[i],
      amount = expected.personal.get(participant.participantId);
    assert.equal(actual.startMs, expected.start);
    assert.equal(actual.endMs, expected.end);
    assert.equal(actual.personalDamage.value, amount);
    assert.equal(actual.globalDamage.value, expected.global);
    near(
      actual.personalRate.value,
      (amount / expected.duration) * 60000,
      'personal rate actual duration',
    );
    near(
      actual.globalRate.value,
      (expected.global / expected.duration) * 60000,
      'global rate actual duration',
    );
    assert.equal(actual.noDeaths, expected.noDeaths);
    assert.equal(actual.deathCount, expected.deaths.length);
    assert.equal(
      actual.nextDeathGapMs,
      expected.next ? expected.next.timestamp - expected.end : null,
    );
    for (const margin of [0, 15000, 30000, 60000]) {
      const covered =
        expected.start >= margin && expected.end + margin <= endMs;
      const noDeaths = !kills.some(
        (k) =>
          expected.start - margin < k.timestamp &&
          k.timestamp <= expected.end + margin,
      );
      assert.equal(
        actual.marginNoDeaths[String(margin)],
        covered ? noDeaths : null,
        'margin follow-up and boundaries',
      );
    }
    const comparable = expected.duration >= 45000 && expected.duration <= 75000;
    assert.equal(actual.comparableMinute, comparable);
    sum += amount;
    if (expected.noDeaths) silent += amount;
    near(
      actual.shareOfFinalDamage.value,
      participant.totalDamageDealtToChampions > 0
        ? amount / participant.totalDamageDealtToChampions
        : null,
      'interval/final damage',
    );
    counts.personalDamageIntervals++;
  }
  assert.equal(
    sum,
    participant.totalDamageDealtToChampions,
    'telescoping source/summary reconciliation',
  );
  assert.equal(report.totalDamage.value, sum);
  assert.equal(report.damageWithoutDeaths.value, silent);
  near(
    report.fractionWithoutDeaths.value,
    sum > 0 ? silent / sum : null,
    'damage fraction',
  );
  const comparable = raw.filter(
    (r) => r.duration >= 45000 && r.duration <= 75000,
  );
  const personalOrder = [...comparable].sort(
    (a, b) =>
      b.personal.get(participant.participantId) / b.duration -
        a.personal.get(participant.participantId) / a.duration ||
      a.start - b.start ||
      a.fi - b.fi,
  );
  const globalOrder = [...comparable].sort(
    (a, b) =>
      b.global / b.duration - a.global / a.duration ||
      a.start - b.start ||
      a.fi - b.fi,
  );
  personalOrder.forEach((r, i) =>
    assert.equal(report.intervals[r.fi - 1].personalRank, i + 1),
  );
  globalOrder.forEach((r, i) =>
    assert.equal(report.intervals[r.fi - 1].globalRank, i + 1),
  );
  const peak =
    personalOrder.find((r) => r.personal.get(participant.participantId) > 0) ??
    null;
  assert.equal(report.personalPeak?.endFrameIndex ?? null, peak?.fi ?? null);
  assert.equal(
    report.personalPeakWithoutDeaths?.endFrameIndex ?? null,
    personalOrder.find(
      (r) => r.noDeaths && r.personal.get(participant.participantId) > 0,
    )?.fi ?? null,
  );
  assert.equal(
    report.globalPeakWithoutDeaths?.endFrameIndex ?? null,
    globalOrder.find((r) => r.noDeaths && r.global > 0)?.fi ?? null,
  );
  return peak;
}
function validateRecap(actual, source) {
  const entries = source.victimDamageReceived;
  assert.equal(actual.eventId, source.eventId);
  assert.equal(actual.timestampMs, source.timestamp);
  assert.equal(actual.windowDurationMs, null);
  assert.equal(
    actual.entries.length,
    Array.isArray(entries) ? entries.length : 0,
  );
  for (const [name, field] of [
    ['physical', 'physicalDamage'],
    ['magic', 'magicDamage'],
    ['true', 'trueDamage'],
  ]) {
    const expected =
      Array.isArray(entries) && entries.every((e) => valid(e[field]))
        ? entries.reduce((s, e) => s + e[field], 0)
        : null;
    assert.equal(
      actual.listedDamage[name],
      expected,
      'literal recap component sum independent of attribution',
    );
    if (Array.isArray(entries))
      entries.forEach((e, i) =>
        assert.equal(
          actual.entries[i].damage[name],
          valid(e[field]) ? e[field] : null,
        ),
      );
  }
  const totals = ['physical', 'magic', 'true'].map(
    (k) => actual.listedDamage[k],
  );
  assert.equal(
    actual.listedDamage.total,
    totals.every(valid) ? totals.reduce((a, b) => a + b, 0) : null,
  );
}
function validateResources(
  report,
  summary,
  timeline,
  participant,
  deaths,
  counts,
) {
  assert.equal(
    report.episodes.length,
    deaths.length,
    'one resource episode per original death',
  );
  const byId = new Map(report.episodes.map((e) => [e.eventId, e]));
  for (const death of deaths) {
    const expected = rawResources(
        summary,
        timeline,
        death,
        participant.participantId,
      ),
      actual = byId.get(death.eventId);
    assert.ok(actual, 'original death resource episode present');
    assert.equal(actual.reason, expected.reason, 'resource eligibility reason');
    assert.equal(actual.eligible, expected.reason === null);
    if (expected.reason === null) counts.cleanDeathResourceEpisodes++;
    counts.deathResourceEpisodes++;
    if (!expected.metrics) {
      assert.equal(actual.metrics, null);
      continue;
    }
    assert.equal(actual.temporalEligible, true);
    counts.temporalDeathResourceEpisodes++;
    assert.deepEqual(
      [actual.baseline.actualMs, actual.before.actualMs, actual.after.actualMs],
      expected.timestamps,
    );
    assert.equal(actual.priorDeath, expected.priorDeath);
    assert.equal(actual.repeatedDeath, expected.repeatedDeath);
    for (const [resource, expectedValues] of Object.entries(expected.metrics)) {
      for (const [name, number] of Object.entries(expectedValues))
        near(
          actual.metrics[resource][name].value,
          number,
          `resource ${resource}.${name}`,
        );
      assert.equal(
        actual.metrics[resource].postRelativePerMinute.denominator.value,
        (expected.timestamps[2] - expected.timestamps[1]) / 60000,
      );
    }
  }
}

export async function validateCorpus(corpus, { expectReference = true } = {}) {
  require('ts-node/register/transpile-only');
  const { normalizeTimelineEvents } = require(
    resolve(ROOT, 'src/modules/matches/adapters/riot/normalized-events.ts'),
  );
  const { projectTimelineSnapshots } = require(
    resolve(ROOT, 'src/modules/matches/adapters/riot/timeline-snapshots.ts'),
  );
  const { projectFinalStats } = require(
    resolve(ROOT, 'src/modules/matches/adapters/riot/final-stats.ts'),
  );
  const { calculateMatchReview } = require(
    resolve(ROOT, 'src/modules/matches/pure/review/match-review-calculator.ts'),
  );
  const { PROCESSING_VERSION } = require(
    resolve(ROOT, 'src/lib/processing-policy.ts'),
  );
  const manifestBytes = readFileSync(resolve(corpus, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(
    new Set(manifest.matches.map((e) => e.id)).size,
    manifest.matches.length,
    'duplicate matches in manifest',
  );
  if (expectReference)
    assert.equal(
      manifest.matches.length,
      120,
      'reference corpus contains 120 original matches',
    );
  const counts = {
    matches: 0,
    hashesChecked: 0,
    participants: 0,
    damageIntervals: 0,
    personalDamageIntervals: 0,
    silentIntervals: 0,
    activeSilentIntervals: 0,
    deathResourceEpisodes: 0,
    temporalDeathResourceEpisodes: 0,
    cleanDeathResourceEpisodes: 0,
    recaps: 0,
    availableRecaps: 0,
    baselineComparableRecaps: 0,
    recapsWithAdditionalSources: 0,
    longMatchParticipants: 0,
    personalPeaksWithoutDeaths: 0,
  };
  const outputSizes = [],
    peakMatches = new Set(),
    examples = [],
    damageExamples = [],
    inputHashes = [];
  const selected = new Map([
    ['BR1_3290385634:8:1155474', [-345, -1559, -1214, 15]],
    ['BR1_3288826802:4:1032020', [-478, 379, 857, -18]],
    ['BR1_3286622241:9:664248', [-483, -2258, -1775, -8]],
  ]);
  for (const entry of manifest.matches) {
    const [summary, timeline] = readPair(corpus, entry),
      id = entry.id;
    counts.matches++;
    counts.hashesChecked += 2;
    inputHashes.push({
      matchId: id,
      summarySha256: entry.summarySha256,
      timelineSha256: entry.timelineSha256,
    });
    const identities = validateIdentity(summary, timeline, id);
    const teams = new Map(
      summary.info.participants.map((p) => [p.participantId, p.teamId]),
    );
    const projection = projectTimelineSnapshots(timeline, identities);
    const events = normalizeTimelineEvents(timeline, identities, teams, {
      processingVersion: PROCESSING_VERSION,
    }).filter((e) => e.type === 'CHAMPION_KILL' || e.type === 'GAME_END');
    const input = {
      matchId: id,
      gameDuration: summary.info.gameDuration,
      gameVersion: summary.info.gameVersion,
      queueId: summary.info.queueId,
      mapId: summary.info.mapId,
      participants: summary.info.participants.map((p) => ({
        puuid: p.puuid,
        teamId: p.teamId,
        role: p.teamPosition,
        championName: p.championName,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        finalStats: projectFinalStats(p),
      })),
      projection,
      events,
      // Deterministic offline scaffolding, never an assertion about an actual DB run.
      processing: {
        status: 'COMPLETED',
        processingVersion: PROCESSING_VERSION,
        completedAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    };
    const kills = killEvents(timeline, id),
      damage = rawDamage(summary, timeline);
    counts.damageIntervals += damage.length;
    counts.silentIntervals += damage.filter((r) => r.noDeaths).length;
    counts.activeSilentIntervals += damage.filter(
      (r) => r.noDeaths && r.global > 0,
    ).length;
    for (const participant of summary.info.participants) {
      const report = calculateMatchReview(input, participant.puuid);
      assert.equal(report.reason, null, `${id}: source availability`);
      assert.equal(report.coverage.snapshots, null, `${id}: snapshot coverage`);
      assert.equal(
        report.coverage.combat,
        null,
        `${id}: combat reconciliation`,
      );
      const deaths = kills.filter(
        (k) => k.victimId === participant.participantId,
      );
      assert.equal(deaths.length, participant.deaths, 'source/summary deaths');
      assert.equal(
        kills.filter((k) => k.killerId === participant.participantId).length,
        participant.kills,
        'source/summary kills',
      );
      validateResources(
        report.resources,
        summary,
        timeline,
        participant,
        deaths,
        counts,
      );
      const peak = validateDamage(
        report.damage,
        participant,
        damage,
        kills,
        projection.observedEndMs,
        counts,
      );
      assert.equal(report.recaps.deaths.length, deaths.length);
      const recapById = new Map(
        report.recaps.deaths.map((r) => [r.eventId, r]),
      );
      for (const death of deaths) {
        const recap = recapById.get(death.eventId);
        validateRecap(recap, death);
        counts.recaps++;
        if (recap.available) counts.availableRecaps++;
        if (recap.available && recap.baselineComparable)
          counts.baselineComparableRecaps++;
        if (recap.additionalSourceIds?.length > 0)
          counts.recapsWithAdditionalSources++;
      }
      if (summary.info.gameDuration >= 600) {
        counts.longMatchParticipants++;
        if (peak?.noDeaths) {
          counts.personalPeaksWithoutDeaths++;
          peakMatches.add(id);
        }
      }
      counts.participants++;
      outputSizes.push(Buffer.byteLength(JSON.stringify(report)));
      for (const episode of report.resources.episodes) {
        const key = `${id}:${participant.participantId}:${episode.deathMs}`,
          expected = selected.get(key);
        if (!expected) continue;
        const found = [
          episode.metrics.gold.beforeLead.value,
          episode.metrics.gold.afterLead.value,
          episode.metrics.gold.postRelativeGain.value,
          episode.metrics.cs.postRelativeGain.value,
        ];
        assert.deepEqual(
          found,
          expected,
          'selected resource example source-derived numbers',
        );
        examples.push({
          matchId: id,
          participantId: participant.participantId,
          champion: participant.championName,
          deathMs: episode.deathMs,
          beforeMs: episode.before.actualMs,
          afterMs: episode.after.actualMs,
          goldLeadBefore: found[0],
          goldLeadAfter: found[1],
          relativeGoldGain: found[2],
          relativeCsGain: found[3],
        });
      }
      if (id === 'BR1_3286609981' && participant.participantId === 1) {
        const interval = report.damage.intervals.find(
          (r) => r.startFrameIndex === 22 && r.endFrameIndex === 23,
        );
        assert.equal(interval.personalDamage.value, 3194);
        assert.equal(interval.noDeaths, true);
        assert.equal(interval.nextDeathGapMs, 13999);
        assert.equal(interval.personalRank, 1);
        assert.equal(report.damage.totalDamage.value, 15619);
        damageExamples.push({
          matchId: id,
          participantId: 1,
          champion: participant.championName,
          startMs: interval.startMs,
          endMs: interval.endMs,
          damage: interval.personalDamage.value,
          totalDamage: report.damage.totalDamage.value,
          noDeaths: interval.noDeaths,
          nextDeathGapMs: interval.nextDeathGapMs,
          personalRank: interval.personalRank,
        });
      }
    }
  }
  if (expectReference) {
    for (const [key, expected] of Object.entries({
      matches: 120,
      hashesChecked: 240,
      participants: 1200,
      damageIntervals: 3233,
      personalDamageIntervals: 32330,
      silentIntervals: 746,
      activeSilentIntervals: 683,
      deathResourceEpisodes: 6798,
      temporalDeathResourceEpisodes: 5446,
      cleanDeathResourceEpisodes: 1571,
      recaps: 6798,
      availableRecaps: 5867,
      baselineComparableRecaps: 4609,
      recapsWithAdditionalSources: 219,
      longMatchParticipants: 1180,
      personalPeaksWithoutDeaths: 16,
    }))
      assert.equal(counts[key], expected, `reference corpus ${key}`);
    assert.equal(peakMatches.size, 13);
    assert.equal(examples.length, 3);
    assert.equal(damageExamples.length, 1);
  }
  outputSizes.sort((a, b) => a - b);
  return {
    validationVersion: 1,
    manifestSha256: HASH(manifestBytes),
    provenance:
      'Original hashed gzip inputs normalized by production adapters; COMPLETED processing metadata is deterministic synthetic offline scaffolding, not a database execution.',
    processingVersion: PROCESSING_VERSION,
    counts: {
      ...counts,
      matchesWithPersonalPeaksWithoutDeaths: peakMatches.size,
    },
    responseBytes: {
      observations: outputSizes.length,
      total: outputSizes.reduce((a, b) => a + b, 0),
      min: outputSizes[0] ?? null,
      median: outputSizes.length
        ? (outputSizes[Math.floor((outputSizes.length - 1) / 2)] +
            outputSizes[Math.ceil((outputSizes.length - 1) / 2)]) /
          2
        : null,
      max: outputSizes.at(-1) ?? null,
    },
    resourceExamples: examples.sort((a, b) =>
      a.matchId.localeCompare(b.matchId),
    ),
    damageExamples,
    inputHashes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(
      'Usage: node scripts/validation/validate-match-review.mjs [--corpus path] [--output path]\n',
    );
    return;
  }
  let corpus = resolve(ROOT, '.tmp/architecture-study-corpus'),
    output = resolve(ROOT, '.tmp/match-review-validation.json');
  for (let i = 0; i < args.length; i++) {
    if (!['--corpus', '--output'].includes(args[i]) || !args[i + 1])
      throw new Error(
        'Usage: node scripts/validation/validate-match-review.mjs [--corpus path] [--output path]',
      );
    if (args[i] === '--corpus') corpus = resolve(args[++i]);
    else output = resolve(args[++i]);
  }
  const start = performance.now(),
    result = await validateCorpus(corpus),
    json = JSON.stringify(result, null, 2) + '\n';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, json);
  // Timing is intentionally excluded from the deterministic result artifact.
  process.stdout.write(
    JSON.stringify({
      status: 'passed',
      counts: result.counts,
      artifactBytes: Buffer.byteLength(json),
      artifactSha256: HASH(json),
      elapsedSeconds: (performance.now() - start) / 1000,
    }) + '\n',
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    process.stderr.write(`Validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
