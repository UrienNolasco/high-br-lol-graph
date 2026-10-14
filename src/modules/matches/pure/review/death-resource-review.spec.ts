import type {
  MatchReviewContext,
  MatchReviewInput,
  ReviewEvent,
} from '../../contracts/match-review';
import type { ParticipantSnapshot } from '../../contracts/normalized-snapshots';
import { calculateDeathResourceReview } from './death-resource-review';
import { prepareMatchReview } from './review-context';

function event(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    matchId: 'm',
    frameIndex: 6,
    eventIndex: 0,
    type: 'CHAMPION_KILL',
    timestampMs: 330000,
    actorParticipantId: 6,
    actorPuuid: 'p6',
    victimParticipantId: 1,
    victimPuuid: 'p1',
    assistingParticipantIds: [],
    assistingPuuids: [],
    sourceTeamId: 200,
    payload: { killerId: 6 },
    quality: {},
    metricVersion: 1,
    processingVersion: 2,
    ...overrides,
  };
}
function snapshot(pid: number, i: number): ParticipantSnapshot {
  return {
    participantId: pid,
    puuid: `p${pid}`,
    totalGold: 1000 + i * (pid === 1 ? 120 : 100),
    xp: i * 100,
    minionsKilled: i * 4,
    jungleMinionsKilled: 0,
    currentGold: 0,
    level: 1,
    position: null,
    damageStats: null,
    championStats: null,
    additionalFields: {},
    missingFields: [],
  };
}
function input(events: ReviewEvent[] = [event()]): MatchReviewInput {
  const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  return {
    matchId: 'm',
    gameDuration: 660,
    gameVersion: '16.19.1',
    queueId: 420,
    mapId: 11,
    participants: Array.from({ length: 10 }, (_, i) => ({
      puuid: `p${i + 1}`,
      championName: `champion${i + 1}`,
      teamId: i < 5 ? 100 : 200,
      role: roles[i % 5],
      kills: events.filter((e) => e.actorPuuid === `p${i + 1}`).length,
      deaths: events.filter((e) => e.victimPuuid === `p${i + 1}`).length,
      assists: null,
      finalStats: null,
    })),
    projection: {
      projectionVersion: 1,
      frameIntervalMs: 60000,
      observedEndMs: 660000,
      frames: Array.from({ length: 12 }, (_, i) => ({
        frameIndex: i,
        timestamp: i * 60000,
        participantFrames: Object.fromEntries(
          Array.from({ length: 10 }, (_, n) => [
            String(n + 1),
            snapshot(n + 1, i),
          ]),
        ),
      })),
    },
    events: [
      ...events,
      event({
        type: 'GAME_END',
        frameIndex: 11,
        timestampMs: 660000,
        actorParticipantId: null,
        actorPuuid: null,
        victimParticipantId: null,
        victimPuuid: null,
      }),
    ],
    processing: {
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('2026-10-01T00:00:00.000Z'),
    },
  };
}
function calculate(source: MatchReviewInput = input()) {
  return calculateDeathResourceReview(prepareMatchReview(source), 'p1');
}

describe('death resource review', () => {
  it('uses same past frames, actual elapsed time, signed differences and preserved evidence', () => {
    const report = calculate();
    expect(report.reason).toBeNull();
    expect(report.opponent?.puuid).toBe('p6');
    const row = report.episodes[0];
    expect(row).toMatchObject({
      eligible: true,
      temporalEligible: true,
      priorDeath: false,
      repeatedDeath: false,
      priorMinutes: 3,
      postMinutes: 3,
    });
    expect([
      row.baseline?.actualMs,
      row.before?.actualMs,
      row.after?.actualMs,
    ]).toEqual([120000, 300000, 480000]);
    expect(row.before?.offsetMs).toBe(-30000);
    expect(row.metrics?.gold.postRelativeGain.value).toBe(60);
    expect(row.metrics?.gold.postRelativePerMinute).toMatchObject({
      value: 20,
      unit: 'gold_per_minute',
      denominator: { value: 3, unit: 'minutes' },
    });
    expect(row.metrics?.gold.relativeRateChange.value).toBe(0);
    expect(row.before?.focal.gold.evidence).toContainEqual({
      source: 'MatchTimelineProjection.frames',
      field: 'participantFrames.p1.totalGold',
      value: 1600,
      frameIndex: 5,
      timestampMs: 300000,
    });
    expect(row.combat?.post.deaths).toBe(1);
    expect(row.combat?.afterDeath.deaths).toBe(0);
  });
  it('does not backfill a missing field or replace unknown values with zero', () => {
    const data = input();
    data.projection!.frames[8].participantFrames['1'].xp = null;
    const row = calculate(data).episodes[0];
    expect(row.eligible).toBe(true);
    expect(row.metrics?.xp.focalPostGain).toMatchObject({
      value: null,
      reason: 'missing_field',
      origin: 'unavailable',
    });
    expect(row.metrics?.cs.postRelativeGain.value).toBe(0);
  });
  it('requires both CS components and rejects regressive counters without destroying other resources', () => {
    const data = input();
    const s = data.projection!.frames[8].participantFrames['1'];
    s.jungleMinionsKilled = null;
    s.totalGold = 1;
    const row = calculate(data).episodes[0];
    expect(row.metrics?.cs.focalPostGain.value).toBeNull();
    expect(row.metrics?.gold.focalPostGain.reason).toBe('counter_regression');
    expect(row.metrics?.laneCs.focalPostGain.value).toBe(12);
    expect(row.tags).toEqual([]);
  });
  it('keeps absent participant snapshots unknown and never chooses an older frame for that participant', () => {
    const data = input();
    delete data.projection!.frames[8].participantFrames['1'];
    const row = calculate(data).episodes[0];
    expect(row.after?.actualMs).toBe(480000);
    expect(row.metrics?.gold.focalPostGain.reason).toBe(
      'missing_participant_snapshot',
    );
  });
  it.each(['sourceReason', 'snapshotReason', 'combatReason'] as const)(
    'preserves listed deaths while refusing calculations when %s fails',
    (key) => {
      const context = prepareMatchReview(input());
      context[key] = 'blocked_fixture';
      const report = calculateDeathResourceReview(context, 'p1');
      expect(report.reason).toBe('blocked_fixture');
      expect(report.episodes).toHaveLength(1);
      expect(report.episodes[0]).toMatchObject({
        reason: 'blocked_fixture',
        eligible: false,
        metrics: null,
        combat: null,
      });
    },
  );
  it('censors near-end deaths and does not extrapolate a follow-up from the final snapshot', () => {
    const data = input();
    data.events[1].timestampMs = 509999;
    data.projection!.observedEndMs = 509999;
    expect(calculate(data).episodes[0]).toMatchObject({
      reason: 'censored_followup',
      eligible: false,
      metrics: null,
    });
  });
  it('does not silently include a snapshot at the exact death timestamp', () => {
    const data = input([event({ timestampMs: 360000 })]);
    expect(calculate(data).episodes[0].reason).toBe('invalid_observed_window');
  });
  it('excludes an insufficient baseline and stale follow-up', () => {
    expect(
      calculate(input([event({ timestampMs: 150000 })])).episodes[0].reason,
    ).toBe('baseline_missing_frame');
    const data = input();
    data.projection!.frames = data.projection!.frames.filter(
      (f) => f.timestamp !== 480000,
    );
    expect(calculate(data).episodes[0].reason).toBe('after_stale_frame');
  });
  it('keeps repeated death episodes with resources but no single-death labels', () => {
    const data = input([
      event(),
      event({ timestampMs: 400000, frameIndex: 7 }),
    ]);
    const report = calculate(data);
    expect(report.episodes).toHaveLength(2);
    expect(report.episodes[0]).toMatchObject({
      reason: 'repeated_death',
      temporalEligible: true,
      eligible: false,
      tags: [],
    });
    expect(report.episodes[0].metrics?.gold.postRelativeGain.value).toBe(60);
    expect(report.episodes[1].priorDeath).toBe(true);
  });
  it('requires uniqueness of the canonical role on both teams', () => {
    const data = input();
    data.participants[6].role = 'TOP';
    expect(calculate(data).episodes[0].reason).toBe('ambiguous_role');
    data.participants[6].role = 'JUNGLE';
    data.participants[1].role = 'TOP';
    expect(calculate(data).reason).toBe('ambiguous_role');
    data.participants[1].role = 'JUNGLE';
    data.participants[0].role = 'MID';
    data.participants[5].role = 'MIDDLE';
    data.participants[2].role = 'TOP';
    data.participants[7].role = 'TOP';
    expect(calculate(data).opponent?.role).toBe('MIDDLE');
  });
  it('separates known recorded assists from unknown total assistance', () => {
    const data = input([
      event(),
      event({
        timestampMs: 400000,
        frameIndex: 7,
        actorPuuid: 'p2',
        actorParticipantId: 2,
        victimPuuid: 'p7',
        victimParticipantId: 7,
        sourceTeamId: 100,
        assistingPuuids: null,
        assistingParticipantIds: null,
        payload: { killerId: 2 },
      }),
    ]);
    const row = calculate(data).episodes[0];
    expect(row.combat?.afterDeath).toMatchObject({
      recordedAssists: 0,
      assists: null,
      reason: 'unknown_assistance',
    });
    expect(row.combat?.afterDeath.unknownAssistEventIds).toHaveLength(1);
  });
  it('keeps opponent death and strict-after-death combat as context, not an exclusion or outcome feature', () => {
    const data = input([
      event(),
      event({
        timestampMs: 400000,
        frameIndex: 7,
        actorPuuid: 'p1',
        actorParticipantId: 1,
        victimPuuid: 'p6',
        victimParticipantId: 6,
        sourceTeamId: 100,
        payload: { killerId: 1 },
      }),
    ]);
    const row = calculate(data).episodes[0];
    expect(row.eligible).toBe(true);
    expect(row.combat?.opponentAfterDeath.deaths).toBe(1);
    expect(row.combat?.afterDeath.kills).toBe(1);
  });
  it('preserves missing identity rather than inferring it from record order', () => {
    const context = prepareMatchReview(input());
    context.participantIds.delete(1);
    expect(
      calculateDeathResourceReview(context, 'p1').episodes[0].metrics?.gold
        .focalPostGain.reason,
    ).toBe('snapshot_identity_mismatch');
  });
  it('uses no arbitrary magnitude threshold for factual directional labels', () => {
    const data = input();
    data.projection!.frames[8].participantFrames['1'].totalGold = 1899;
    data.projection!.frames[8].participantFrames['1'].minionsKilled = 33;
    const row = calculate(data).episodes[0];
    expect(row.metrics?.gold.postRelativeGain.value).toBe(-1);
    expect(row.metrics?.cs.postRelativeGain.value).toBe(1);
    expect(row.tags).toContain('more_cs_less_gold');
  });

  it.each([
    {
      name: 'Viktor/Katarina',
      death: 1155474,
      times: [960250, 1140298, 1320384],
      focalGold: [5999, 7436, 8590],
      opponentGold: [6955, 7781, 10149],
      focalCs: [140, 172, 197],
      opponentCs: [130, 146, 156],
      expected: [-345, -1559, -1214, 15],
      tag: 'more_cs_less_gold',
    },
    {
      name: 'Aurora/Corki',
      death: 1032020,
      times: [840243, 1020302, 1200334],
      focalGold: [5480, 7751, 9699],
      opponentGold: [6403, 8229, 9320],
      focalCs: [94, 125, 138],
      opponentCs: [113, 139, 170],
      expected: [-478, 379, 857, -18],
      tag: 'less_cs_more_gold',
    },
  ])(
    'reconciles source-derived reduced $name example (not an additional observation)',
    (sample) => {
      // Literal endpoints independently checked against original corpus in research;
      // surrounding participants and processing metadata are synthetic test scaffolding.
      const data = input();
      const context: MatchReviewContext = prepareMatchReview(data);
      context.endMs = sample.death + 200000;
      context.kills[0].timestampMs = sample.death;
      context.frames = sample.times.map((timestamp, i) => ({
        frameIndex: i,
        timestamp,
        participantFrames: {
          '1': {
            ...snapshot(1, i),
            totalGold: sample.focalGold[i],
            minionsKilled: sample.focalCs[i],
          },
          '6': {
            ...snapshot(6, i),
            totalGold: sample.opponentGold[i],
            minionsKilled: sample.opponentCs[i],
          },
        },
      }));
      const row = calculateDeathResourceReview(context, 'p1').episodes[0];
      expect(row.eligible).toBe(true);
      expect([
        row.metrics?.gold.beforeLead.value,
        row.metrics?.gold.afterLead.value,
        row.metrics?.gold.postRelativeGain.value,
        row.metrics?.cs.postRelativeGain.value,
      ]).toEqual(sample.expected);
      expect(row.tags).toContain(sample.tag);
      expect(row.postMinutes).toBe((sample.times[2] - sample.times[1]) / 60000);
    },
  );
});
