import { calculateEconomy, EconomyInput } from './economy-calculator';
import {
  economyFixture,
  economySummary,
  economyTimeline,
} from '../../../../test/fixtures/economy.fixture';

function synthetic(times: number[]): EconomyInput {
  const input = economyFixture();
  const template = input.projection!.frames[0];
  input.projection!.frames = times.map((timestamp, frameIndex) => {
    const frame = structuredClone(template);
    frame.timestamp = timestamp;
    frame.frameIndex = frameIndex;
    for (const p of Object.values(frame.participantFrames)) {
      p.totalGold = 500 + frameIndex * 100;
      p.currentGold = [0, 1000, 3000][frameIndex] ?? 10;
      p.xp = frameIndex * 60;
      p.level = frameIndex + 1;
      p.minionsKilled = frameIndex * 4;
      p.jungleMinionsKilled = frameIndex;
    }
    return frame;
  });
  input.projection!.observedEndMs = times.at(-1)!;
  return input;
}

describe('MET12 economy from actual observations', () => {
  it('reconciles every 5/10/15/20 checkpoint for all ten participants against independently selected real frames', () => {
    const input = economyFixture();
    for (const p of input.participants) {
      const id = economyTimeline.info.participants.find(
        (row) => row.puuid === p.puuid,
      ).participantId;
      const report = calculateEconomy(input, p.puuid);
      expect(report.eligible).toBe(true);
      expect(report.samples).toHaveLength(41);
      for (const checkpoint of report.checkpoints) {
        const independent = [...economyTimeline.info.frames].sort(
          (a, b) =>
            Math.abs(a.timestamp - checkpoint.targetMs) -
              Math.abs(b.timestamp - checkpoint.targetMs) ||
            a.timestamp - b.timestamp,
        )[0];
        const raw = independent.participantFrames[String(id)];
        expect(checkpoint.actualMs).toBe(independent.timestamp);
        expect(checkpoint.offsetMs).toBe(
          independent.timestamp - checkpoint.targetMs,
        );
        expect(checkpoint).toMatchObject({
          eligible: true,
          comparisonEligible: true,
          mode: 'nearest',
          toleranceMs: 60000,
        });
        expect(
          Object.fromEntries(
            Object.entries(checkpoint.values).map(([k, v]) => [k, v.value]),
          ),
        ).toMatchObject({
          totalGold: raw.totalGold,
          currentGold: raw.currentGold,
          xp: raw.xp,
          level: raw.level,
          laneCs: raw.minionsKilled,
          jungleCs: raw.jungleMinionsKilled,
          totalCs: raw.minionsKilled + raw.jungleMinionsKilled,
        });
        const opponent = input.participants.find(
          (row) => row.puuid === report.opponent.puuid,
        )!;
        const opponentId = economyTimeline.info.participants.find(
          (row) => row.puuid === opponent.puuid,
        ).participantId;
        expect(checkpoint.differences.totalGold.value).toBe(
          raw.totalGold - independent.participantFrames[opponentId].totalGold,
        );
      }
    }
  });
  it('uses the observed 28157ms final interval, preserving both final same-minute frames and phase endpoints', () => {
    const input = economyFixture(),
      p = input.participants[0];
    const report = calculateEconomy(input, p.puuid);
    const last = report.intervals.at(-1)!;
    const frames = economyTimeline.info.frames.slice(-2);
    const id = economyTimeline.info.participants.find(
      (row) => row.puuid === p.puuid,
    ).participantId;
    const delta =
      frames[1].participantFrames[id].totalGold -
      frames[0].participantFrames[id].totalGold;
    expect(last).toMatchObject({
      startMs: 2340765,
      endMs: 2368922,
      elapsedMs: 28157,
      partialFinalInterval: true,
    });
    expect(last.gains.totalGold.value).toBe(delta);
    expect(last.perMinute.totalGold.value).toBeCloseTo(
      delta / (28157 / 60000),
      10,
    );
    expect(report.phases.at(-1)).toMatchObject({
      targetStartMs: 1200000,
      targetEndMs: 2368922,
      endMs: 2368922,
    });
    expect(report.endSource).toBe('GAME_END');
  });
  it('selects nearest versus past-only explicitly and never replaces a missing participant using another frame', () => {
    const input = synthetic([250000, 310000, 600000]),
      puuid = input.participants[0].puuid;
    expect(calculateEconomy(input, puuid).checkpoints[0].actualMs).toBe(310000);
    expect(
      calculateEconomy(input, puuid, 'pastOnly').checkpoints[0].actualMs,
    ).toBe(250000);
    const key = Object.keys(input.projection!.frames[1].participantFrames).find(
      (k) => input.projection!.frames[1].participantFrames[k].puuid === puuid,
    )!;
    delete input.projection!.frames[1].participantFrames[key];
    expect(calculateEconomy(input, puuid).checkpoints[0]).toMatchObject({
      actualMs: 310000,
      eligible: false,
      reason: 'missing_participant_frame',
      values: { totalGold: { value: null } },
    });
  });
  it('reports short matches and out-of-tolerance gaps with no fabricated checkpoint', () => {
    const input = synthetic([0, 200000, 650000]),
      puuid = input.participants[0].puuid;
    const report = calculateEconomy(input, puuid);
    expect(report.checkpoints[0]).toMatchObject({
      actualMs: null,
      reason: 'missing_frame',
      values: { totalGold: { value: null } },
    });
    expect(report.checkpoints[2]).toMatchObject({
      actualMs: null,
      reason: 'short_match',
      values: { level: { value: null } },
    });
  });
  it('retains valid zeros but keeps missing lane farm/currentGold null without final-stat balance substitution', () => {
    const input = synthetic([0, 300000, 600000]),
      puuid = input.participants[0].puuid;
    const frame = input.projection!.frames[1];
    const participant = Object.values(frame.participantFrames).find(
      (p) => p.puuid === puuid,
    )!;
    participant.minionsKilled = null;
    participant.currentGold = null;
    participant.jungleMinionsKilled = 0;
    const report = calculateEconomy(input, puuid);
    expect(report.checkpoints[0].values).toMatchObject({
      laneCs: { value: null, reason: 'missing_field' },
      totalCs: { value: null },
      jungleCs: { value: 0, origin: 'observed' },
      currentGold: { value: null },
    });
    expect(report.samples[0].values.currentGold.value).toBe(0);
    expect(report.intervals[0].gains.totalCs.value).toBeNull();
  });
  it('makes comparisons unavailable for ambiguous roles on either side while preserving individual observations', () => {
    for (const sameTeam of [true, false]) {
      const input = economyFixture(),
        player = input.participants[0];
      const other = input.participants.find(
        (p) =>
          p.puuid !== player.puuid &&
          (p.teamId === player.teamId) === sameTeam &&
          p.role !== player.role,
      )!;
      other.role = player.role;
      const checkpoint = calculateEconomy(input, player.puuid).checkpoints[0];
      expect(checkpoint).toMatchObject({
        eligible: true,
        comparisonEligible: false,
        comparisonReason: 'ambiguous_role',
      });
      expect(checkpoint.values.totalGold.value).not.toBeNull();
      expect(checkpoint.differences.totalGold).toMatchObject({
        value: null,
        reason: 'ambiguous_role',
      });
    }
  });
  it('rejects unsupported remake rules and early-surrender ambiguity without equating ordinary surrender with remake', () => {
    const input = economyFixture(),
      puuid = input.participants[0].puuid;
    expect(calculateEconomy(input, puuid).eligible).toBe(true);
    input.gameVersion = '16.20.1';
    expect(calculateEconomy(input, puuid)).toMatchObject({
      eligible: false,
      reason: 'unsupported_version',
    });
    input.gameVersion = '16.2.1';
    (input.participants[0].finalStats as any).values.gameEndedInEarlySurrender =
      true;
    expect(calculateEconomy(input, puuid).reason).toBe('unknown_remake');
  });
  it('exposes missing processing provenance globally and never invents request-time processedAt or legacy arrays', () => {
    const input = economyFixture(),
      puuid = input.participants[0].puuid;
    input.processing = null;
    expect(calculateEconomy(input, puuid)).toMatchObject({
      processedAt: null,
      processingVersion: null,
      reason: 'missing_processing_provenance',
      samples: [],
      checkpointContract: { metricVersion: 1, legacyAt15Version: 0 },
    });
    input.processing = economyFixture().processing;
    input.projection = null;
    expect(calculateEconomy(input, puuid)).toMatchObject({
      reason: 'missing_projection',
      samples: [],
    });
  });
  it('rejects generation 1 even when rows resemble complete new projections', () => {
    const input = economyFixture(),
      puuid = input.participants[0].puuid;
    input.processing!.processingVersion = 1;
    const report = calculateEconomy(input, puuid);
    expect(report).toMatchObject({
      processingVersion: 1,
      processedAt: '2026-09-23T00:00:00.000Z',
      eligible: false,
      reason: 'unsupported_version',
      samples: [],
    });
    expect(report.checkpoints[0].values.totalGold).toMatchObject({
      value: null,
      reason: 'unsupported_version',
    });
  });

  it('does not calculate rates across zero elapsed time or a regressing counter', () => {
    const input = synthetic([0, 300000, 300000, 600000]),
      puuid = input.participants[0].puuid;
    let report = calculateEconomy(input, puuid);
    expect(report.intervals[1].perMinute.totalGold).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    expect(report.checkpoints[0].frameIndex).toBe(1);
    for (const p of Object.values(
      input.projection!.frames[3].participantFrames,
    ))
      p.totalGold = 1;
    report = calculateEconomy(input, puuid);
    expect(report.intervals[2].gains.totalGold).toMatchObject({
      value: null,
      reason: 'counter_regression',
    });
  });
  it('requires complete five-member same-frame totals for resource shares and exposes zero CS denominator', () => {
    const input = synthetic([0, 300000]),
      player = input.participants[0];
    let report = calculateEconomy(input, player.puuid);
    expect(report.checkpoints[0].values.goldShare.value).toBe(0.2);
    expect(report.samples[0].values.csShare).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    const teammate = input.participants.find(
      (p) => p.teamId === player.teamId && p.puuid !== player.puuid,
    )!;
    for (const snapshot of Object.values(
      input.projection!.frames[1].participantFrames,
    ))
      if (snapshot.puuid === teammate.puuid) snapshot.totalGold = null;
    report = calculateEconomy(input, player.puuid);
    expect(report.checkpoints[0].values.goldShare).toMatchObject({
      value: null,
      reason: 'missing_team_sample',
      quality: { validSamples: 4, totalSamples: 5 },
    });
  });
  it('summarizes sampled currentGold without labelling balance as waste or elapsed-time probability', () => {
    const input = synthetic([0, 300000, 320000]),
      puuid = input.participants[0].puuid;
    const report = calculateEconomy(input, puuid);
    expect(report.unspentGold.maximum.value).toBe(3000);
    expect(report.unspentGold.median.value).toBe(1000);
    expect(report.unspentGold.fractionAboveThreshold).toMatchObject({
      value: 2 / 3,
      denominator: { value: 3, unit: 'snapshots' },
      quality: { coverage: 1 },
    });
    expect(report.intervals[0].gains.currentGold).toBeUndefined();
  });
  it('returns literal final allied/enemy jungle counters, distinct from sampled jungle farm', () => {
    const input = economyFixture(),
      player = input.participants[0];
    const source = economySummary.info.participants.find(
      (p) => p.puuid === player.puuid,
    );
    const report = calculateEconomy(input, player.puuid);
    for (const field of [
      'totalAllyJungleMinionsKilled',
      'totalEnemyJungleMinionsKilled',
    ])
      expect(report.finalResources[field]).toMatchObject({
        value: source[field],
        origin: 'observed',
        metricId: 'E10',
      });
  });
});
