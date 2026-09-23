import { PROCESSING_VERSION } from '../../../core/processing/processing.constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateVision, VisionInput, VisionEvent } from './vision-calculator';
import { normalizeTimelineEvents } from '../../../core/riot/normalized-events';
import { projectFinalStats } from '../../../core/riot/final-stats';
import { MatchDto } from '../../../core/riot/dto/match.dto';
import { TimelineDto } from '../../../core/riot/dto/timeline.dto';
const summary = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
) as MatchDto;
const timeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
) as TimelineDto;
function realInput(): VisionInput {
  return {
    matchId: summary.metadata.matchId,
    gameVersion: summary.info.gameVersion,
    gameDuration: summary.info.gameDuration,
    participants: summary.info.participants.map((p) => ({
      puuid: p.puuid,
      teamId: p.teamId,
      finalStats: projectFinalStats(p),
    })),
    events: normalizeTimelineEvents(
      timeline,
      new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
      new Map(
        summary.info.participants.map((p) => [p.participantId, p.teamId]),
      ),
    ),
    processing: {
      status: 'COMPLETED',
      processingVersion: PROCESSING_VERSION,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
  };
}
function event(
  type: string,
  timestampMs: number,
  eventIndex: number,
  wardType = 'YELLOW_TRINKET',
): VisionEvent {
  return {
    matchId: 'M',
    frameIndex: 0,
    eventIndex,
    type,
    timestampMs,
    actorPuuid: 'a',
    beneficiaryTeamId: 100,
    payload: { wardType },
    metricVersion: 1,
    processingVersion: 2,
  };
}
function small(events: VisionEvent[], end = 1800000): VisionInput {
  return {
    matchId: 'M',
    gameVersion: '16.2.1',
    gameDuration: end / 1000,
    participants: [
      {
        puuid: 'a',
        teamId: 100,
        finalStats: projectFinalStats({ wardsPlaced: 0, visionScore: 0 }),
      },
      { puuid: 'b', teamId: 200, finalStats: projectFinalStats({}) },
    ],
    events: [...events, event('GAME_END', end, 999)],
    processing: {
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
  };
}
it('reconciles 196 recognized and 556 unknown placements and 51 removals across every real participant', () => {
  const input = realInput();
  const reports = input.participants.map((p) =>
    calculateVision(input, p.puuid),
  );
  expect(
    reports.reduce((n, r) => n + r.metrics!.recognizedPlacements.value!, 0),
  ).toBe(196);
  expect(
    reports.reduce((n, r) => n + r.metrics!.unknownPlacements.value!, 0),
  ).toBe(556);
  expect(
    reports.reduce((n, r) => n + r.metrics!.recognizedRemovals.value!, 0),
  ).toBe(51);
  for (const report of reports) {
    expect(report.reconciliation).toMatchObject({
      placementDifference: 0,
      removalDifference: 0,
    });
    expect(report.metrics!.placementShare.denominator!.value).toBeGreaterThan(
      0,
    );
  }
  const zilean = reports[9];
  expect(zilean.metrics!.visionWardsBoughtInGame.value).toBe(2);
  expect(zilean.metrics!.controlPlacements.value).toBe(1);
  expect(zilean.metrics!.visionScore.value).toBe(110);
  expect(zilean.metrics!.visionScoreShare.value).toBeCloseTo(
    (110 / (39 + 51 + 39 + 30 + 110)) * 100,
  );
  expect(zilean.metrics!.removalShare.value).toBeCloseTo(
    (10 / (4 + 8 + 8 + 3 + 10)) * 100,
  );
  expect(zilean.metrics!.recognizedPlacementsPerMinute.value).toBeCloseTo(
    43 / (2368922 / 60000),
  );
  expect(zilean.gaps[0].metric.metricId).toContain('V05.');
  expect(zilean.phases[0].teamRecognizedRemovalDifference.metricId).toContain(
    'V07.',
  );
  expect(
    zilean.objectiveWindows[0].player.recognizedPlacements.metricId,
  ).toContain('V06.');
  expect(zilean.objectiveWindows).toHaveLength(24);
  expect(
    zilean.events
      .filter((e) => e.type === 'WARD_PLACED')
      .every((e) => e.position === null),
  ).toBe(true);
});
it('unknown future types retain identity/category and never become recognized wards', () => {
  const r = calculateVision(
    small([event('WARD_PLACED', 100, 0, 'FUTURE_WARD')]),
    'a',
  );
  expect(r.metrics!.recognizedPlacements.value).toBe(0);
  expect(r.metrics!.unknownPlacements.value).toBe(1);
  expect(
    r.byType.find((t) => t.type === 'UNKNOWN')!.metrics.placements.value,
  ).toBe(1);
  expect(r.events[0]).toMatchObject({
    eventId: 'M:0:0',
    wardType: 'FUTURE_WARD',
    wardCategory: 'unknown',
  });
});
it('preserves simultaneous identities, deduplicates repeated source rows, and uses disjoint phase boundaries', () => {
  const a = event('WARD_PLACED', 840000, 1),
    b = event('WARD_PLACED', 840000, 2);
  const r = calculateVision(small([a, b, a]), 'a');
  expect(r.metrics!.recognizedPlacements.value).toBe(2);
  expect(r.coverage.duplicateInputIdentities).toBe(1);
  expect(r.phases[0].metrics.recognizedPlacements.value).toBe(0);
  expect(r.phases[1].metrics.recognizedPlacements.value).toBe(2);
});
it('pre-objective windows include start, exclude capture, and expose game-start censoring and team provenance', () => {
  const r = calculateVision(
    small([
      event('WARD_PLACED', 0, 0),
      event('WARD_PLACED', 30000, 1),
      event('ELITE_MONSTER_KILL', 30000, 2),
    ]),
    'a',
  );
  expect(r.objectiveWindows).toHaveLength(2);
  const w = r.objectiveWindows[0];
  expect(w).toMatchObject({
    lookbackMs: 60000,
    requestedStartMs: -30000,
    censored: true,
    window: { startMs: 0, endMs: 30000, bounds: '[)' },
    eventIds: ['M:0:0'],
  });
  expect(w.player.recognizedPlacements.value).toBe(1);
  expect(w.teams[0].metrics.recognizedPlacements.subject).toEqual({
    kind: 'team',
    id: '100',
  });
  const exact = calculateVision(
    small([
      event('WARD_PLACED', 60000, 0),
      event('WARD_PLACED', 59999, 1),
      event('ELITE_MONSTER_KILL', 120000, 2),
    ]),
    'a',
  );
  expect(exact.objectiveWindows[0].eventIds).toEqual(['M:0:0']);
});
it('publishes both interior and edge-inclusive recognized-placement gaps without equating unknown wards to absence', () => {
  const r = calculateVision(
    small(
      [
        event('WARD_PLACED', 100000, 0),
        event('WARD_PLACED', 200000, 1),
        event('WARD_PLACED', 600000, 2, 'UNDEFINED'),
      ],
      1000000,
    ),
    'a',
  );
  expect(r.gaps[0]).toMatchObject({
    includeGameEdges: false,
    startMs: 100000,
    endMs: 200000,
    unknownPlacementEvents: 1,
    metric: { value: 100 },
  });
  expect(r.gaps[1]).toMatchObject({
    includeGameEdges: true,
    startMs: 200000,
    endMs: 1000000,
    endEventId: null,
    metric: { value: 800 },
  });
  const empty = calculateVision(small([], 200000), 'a');
  expect(empty.gaps[0].metric).toMatchObject({
    value: null,
    reason: 'insufficient_sample',
  });
  expect(empty.gaps[1].metric.value).toBe(200);
  expect(empty.metrics!.placementShare).toMatchObject({
    value: null,
    reason: 'zero_denominator',
  });
});
it('distinguishes missing processing, incomplete projection, absent counters and observed zero', () => {
  const input = small([]);
  expect(calculateVision({ ...input, processing: null }, 'a')).toMatchObject({
    metrics: null,
    processedAt: null,
    reason: 'not_calculated',
  });
  expect(
    calculateVision(
      {
        ...input,
        processing: { ...input.processing!, processingVersion: null },
      },
      'a',
    ).metrics,
  ).toBeNull();
  const incomplete = calculateVision({ ...input, events: [] }, 'a');
  expect(incomplete.metrics!.recognizedPlacements).toMatchObject({
    value: null,
    reason: 'missing_field',
  });
  expect(incomplete.metrics!.visionScore.value).toBe(0);
  expect(incomplete.metrics!.visionWardsBoughtInGame).toMatchObject({
    value: null,
    reason: 'missing_field',
  });
});
it('requires known actors/timestamps and compatible projection generation for counts', () => {
  for (const overrides of [
    { actorPuuid: null },
    { timestampMs: null },
    { processingVersion: 3 },
    { metricVersion: 2 },
  ]) {
    const r = calculateVision(
      small([{ ...event('WARD_PLACED', 100, 1), ...overrides }]),
      'a',
    );
    expect(r.metrics!.recognizedPlacements.value).toBeNull();
    expect(r.coverage.projectionComplete).toBe(false);
  }
  const input = small([event('WARD_PLACED', 1, 1)]);
  input.processing!.processingVersion = 3;
  input.events.forEach((e) => (e.processingVersion = 3));
  expect(calculateVision(input, 'a').metrics!.recognizedPlacements.value).toBe(
    1,
  );
});
it('rejects absent participants and never mutates source arrays', () => {
  const input = small([event('WARD_PLACED', 2, 2), event('WARD_PLACED', 1, 1)]),
    before = structuredClone(input);
  calculateVision(input, 'a');
  expect(input).toEqual(before);
  expect(() => calculateVision(input, 'missing')).toThrow(
    'Participant not found',
  );
});
