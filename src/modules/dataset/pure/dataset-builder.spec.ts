import {
  buildHistoricalDataset,
  contributionIdentity,
  DatasetContribution,
  DatasetInput,
  predictiveDatasetCells,
} from './dataset-builder';
import { DATASET_DEFINITIONS, DATASET_HORIZONS } from '../contracts/definition';
import { historicalDatasetFixture } from '../../../../test/fixtures/historical-dataset';

const prefixCell = (
  input: DatasetInput,
  definitionId: string,
  subjectId = input.participants[0].puuid,
  kind = 'participant',
  horizon = 600000,
) => {
  const result = predictiveDatasetCells(input, horizon).find(
    (r) =>
      r.definitionId === definitionId &&
      r.subjectId === subjectId &&
      r.kind === kind,
  );
  expect(result).toBeDefined();
  return result!;
};
const contribution = (
  rows: DatasetContribution[],
  definitionId: string,
  subjectId: string,
  subjectKind = 'participant',
  horizonKey = 'final',
) => {
  const row = rows.find(
    (r) =>
      r.definitionId === definitionId &&
      r.subjectId === subjectId &&
      r.subjectKind === subjectKind &&
      r.horizonKey === horizonKey,
  );
  expect(row).toBeDefined();
  return row!;
};
const sourceKill = (input: DatasetInput) => {
  const event = structuredClone(
    input.events.find((e) => e.type === 'CHAMPION_KILL')!,
  );
  event.timestampMs = 100000;
  event.frameTimestampMs = 120000;
  return event;
};

describe('MET19 predictive prefixes — adversarial leakage and attribution', () => {
  it.each(DATASET_HORIZONS)(
    'does not change feature values/evidence at t=%d after removing or poisoning future data and final outcomes',
    (horizon) => {
      const input = historicalDatasetFixture();
      const expected = predictiveDatasetCells(input, horizon);
      const trimmed = structuredClone(input);
      trimmed.events = trimmed.events.filter(
        (e) => e.timestampMs !== null && e.timestampMs <= horizon,
      );
      trimmed.projection.frames = trimmed.projection.frames.filter(
        (f) => f.timestamp !== null && f.timestamp <= horizon,
      );
      expect(predictiveDatasetCells(trimmed, horizon)).toEqual(expected);
      // Predictive extraction needs identity/cohort only, not completed summary observations.
      for (const p of trimmed.participants)
        for (const field of [
          'win',
          'kills',
          'deaths',
          'assists',
          'goldEarned',
          'totalDamage',
          'finalStats',
          'challenges',
          'finalInventory',
        ])
          delete (p as unknown as Record<string, unknown>)[field];
      for (const team of trimmed.teams)
        for (const field of ['win', 'finalObjectives'])
          delete (team as unknown as Record<string, unknown>)[field];
      delete (trimmed.match as unknown as Record<string, unknown>).finalContext;
      expect(predictiveDatasetCells(trimmed, horizon)).toEqual(expected);
      const poisoned = structuredClone(input);
      for (const frame of poisoned.projection.frames)
        if (frame.timestamp !== null && frame.timestamp > horizon) {
          for (const p of Object.values(frame.participantFrames)) {
            p.totalGold = Number.MAX_VALUE;
            p.currentGold = null;
            p.xp = -1;
            p.minionsKilled = null;
            p.jungleMinionsKilled = 999999;
          }
        }
      for (const event of poisoned.events)
        if (event.timestampMs !== null && event.timestampMs > horizon) {
          event.type = 'CHAMPION_KILL';
          event.actorPuuid = null;
          event.assistingPuuids = null;
          event.processingVersion = 999;
          event.metricVersion = 999;
          event.payload = { winningTeam: 999, bounty: 999999 };
        }
      for (const p of poisoned.participants) {
        p.win = !p.win;
        p.kills = 99999;
        p.deaths = 99999;
        p.assists = 99999;
        p.goldEarned = 999999;
        p.totalDamage = 999999;
        p.finalStats = {
          projectionVersion: 99,
          values: { goldEarned: 999999, timePlayed: 1 },
        };
      }
      for (const team of poisoned.teams) {
        team.win = !team.win;
        team.finalObjectives = {
          projectionVersion: 99,
          values: { tower: { kills: 99 } },
        };
      }
      poisoned.match.gameDuration = 1;
      poisoned.match.finalContext = { gameEndTimestamp: 1 };
      poisoned.projection.observedEndMs = 1;
      expect(predictiveDatasetCells(poisoned, horizon)).toEqual(expected);
      for (const row of expected) {
        if (row.metric.value !== null) {
          expect(row.sourceMaxTimestampMs).not.toBeNull();
          expect(row.sourceMaxTimestampMs!).toBeLessThanOrEqual(horizon);
        }
        for (const evidence of row.metric.evidence)
          if (evidence.timestampMs !== undefined)
            expect(evidence.timestampMs).toBeLessThanOrEqual(horizon);
      }
    },
  );
  it('preserves zero, requires both same-frame CS components, and exposes missing teammate rather than partial team sum', () => {
    const input = historicalDatasetFixture(),
      player = input.participants[0];
    const frame = input.projection.frames
      .filter((f) => f.timestamp !== null && f.timestamp <= 600000)
      .sort((a, b) => b.timestamp! - a.timestamp!)[0];
    const snapshot = Object.values(frame.participantFrames).find(
      (p) => p.puuid === player.puuid,
    )!;
    snapshot.currentGold = 0;
    snapshot.minionsKilled = 0;
    snapshot.jungleMinionsKilled = 0;
    expect(prefixCell(input, 'snapshot.currentGold').metric.value).toBe(0);
    expect(prefixCell(input, 'snapshot.totalCs').metric.value).toBe(0);
    snapshot.jungleMinionsKilled = null;
    expect(prefixCell(input, 'snapshot.totalCs').metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
    expect(
      prefixCell(input, 'snapshot.totalCs', String(player.teamId), 'team')
        .metric,
    ).toMatchObject({
      value: null,
      quality: { validSamples: 4, totalSamples: 5, coverage: 0.8 },
    });
    const selectedGold = prefixCell(input, 'snapshot.totalGold').metric.value;
    expect(selectedGold).toBe(snapshot.totalGold);
  });
  it('uses a past-only tolerance, never a nearer future frame or zeros when the prefix observation is missing', () => {
    const input = historicalDatasetFixture();
    input.projection.frames = input.projection.frames.filter(
      (f) =>
        f.timestamp !== null && (f.timestamp < 539999 || f.timestamp > 600000),
    );
    expect(prefixCell(input, 'snapshot.totalGold').metric).toMatchObject({
      value: null,
      reason: 'missing_frame',
    });
    expect(prefixCell(input, 'events.kills').metric.value).toBeNull();
  });
  it('uses registered prefix counts without gating valid zero on incompatible final match totals', () => {
    const input = historicalDatasetFixture();
    input.events = [];
    expect(input.participants.some((p) => p.kills > 0)).toBe(true);
    for (const id of [
      'events.kills',
      'events.deaths',
      'events.assists',
      'events.soloKills',
      'events.wardsPlaced',
    ])
      expect(prefixCell(input, id).metric).toMatchObject({
        value: 0,
        reason: null,
      });
  });
  it('does not invalidate player/team kill zeros for a known environmental killerId0, while retaining the known death', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.actorPuuid = null;
    event.actorParticipantId = null;
    event.sourceTeamId = null;
    event.payload = { ...event.payload, killerId: 0 };
    event.assistingParticipantIds = [];
    event.assistingPuuids = [];
    event.quality.sentinelFields = ['killerId'];
    input.events = [event];
    expect(prefixCell(input, 'events.kills').metric.value).toBe(0);
    expect(prefixCell(input, 'events.kills', '100', 'team').metric.value).toBe(
      0,
    );
    expect(
      prefixCell(input, 'events.deaths', event.victimPuuid!).metric.value,
    ).toBe(1);
  });
  it('does not convert malformed assistant lists normalized to[] into observed solo kills', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.actorPuuid = input.participants[0].puuid;
    event.actorParticipantId = 1;
    event.assistingParticipantIds = [];
    event.assistingPuuids = [];
    event.payload = { ...event.payload, assistingParticipantIds: ['invalid'] };
    event.quality.invalidFields = ['assistingParticipantIds[0]'];
    input.events = [event];
    expect(prefixCell(input, 'events.soloKills').metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
    expect(prefixCell(input, 'events.assists').metric.value).toBeNull();
  });
  it('keeps attribution-unknown events unavailable rather than pretending no participant authored a solo kill', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.actorPuuid = null;
    event.actorParticipantId = 999;
    event.payload = { ...event.payload, killerId: 999 };
    event.assistingPuuids = [];
    event.assistingParticipantIds = [];
    input.events = [event];
    expect(prefixCell(input, 'events.soloKills').metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
    expect(prefixCell(input, 'events.kills').metric.value).toBeNull();
  });
  it('rejects unknown snapshot definitions', () => {
    const unknown = historicalDatasetFixture();
    unknown.projection.projectionVersion = 999;
    expect(prefixCell(unknown, 'snapshot.totalGold').metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
  });
  it('never publishes non-finite summed feature values', () => {
    const input = historicalDatasetFixture(),
      frame = input.projection.frames
        .filter((f) => f.timestamp !== null && f.timestamp <= 600000)
        .sort((a, b) => b.timestamp! - a.timestamp!)[0];
    const p = Object.values(frame.participantFrames).find(
      (p) => p.puuid === input.participants[0].puuid,
    )!;
    p.minionsKilled = Number.MAX_VALUE;
    p.jungleMinionsKilled = Number.MAX_VALUE;
    expect(prefixCell(input, 'snapshot.totalCs').metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
  });
  it('counts identical replay identities once, preserves simultaneous distinct events and rejects conflicting identity content', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input),
      puuid = event.actorPuuid!;
    input.events = [event, structuredClone(event)];
    expect(prefixCell(input, 'events.kills', puuid).metric.value).toBe(1);
    input.events = [
      event,
      { ...structuredClone(event), eventIndex: event.eventIndex + 1 },
    ];
    expect(prefixCell(input, 'events.kills', puuid).metric.value).toBe(2);
    const other = input.participants.find((p) => p.puuid !== puuid)!;
    input.events = [
      event,
      { ...structuredClone(event), actorPuuid: other.puuid },
    ];
    expect(prefixCell(input, 'events.kills', puuid).metric).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
  });
  it('includes an event at t but excludes the next millisecond without rounding event timestamps', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.timestampMs = 600000;
    input.events = [
      event,
      {
        ...structuredClone(event),
        eventIndex: event.eventIndex + 1,
        timestampMs: 600001,
      },
    ];
    expect(
      prefixCell(input, 'events.kills', event.actorPuuid!).metric.value,
    ).toBe(1);
  });
  it('rejects a foreign match event even when its timestamp and participant identity fit this prefix', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.matchId = 'BR1_OTHER_MATCH';
    input.events = [event];
    expect(
      prefixCell(input, 'events.kills', event.actorPuuid!).metric,
    ).toMatchObject({ value: null, origin: 'unavailable' });
    expect(
      prefixCell(input, 'events.wardsPlaced', event.actorPuuid!).metric.value,
    ).toBe(0);
    expect(
      prefixCell(input, 'snapshot.totalGold', event.actorPuuid!).metric.value,
    ).not.toBeNull();
  });
  it('requires known event version and marks a missing-timestamp prefix event unavailable', () => {
    const input = historicalDatasetFixture(),
      event = sourceKill(input);
    event.metricVersion = 99;
    input.events = [event];
    expect(prefixCell(input, 'events.kills').metric.value).toBeNull();
    event.metricVersion = 1;
    event.timestampMs = null;
    event.frameTimestampMs = 120000;
    expect(prefixCell(input, 'events.kills').metric.value).toBeNull();
  });
});

describe('MET19 historical contributions — identities, labels and aggregation operands', () => {
  let input: DatasetInput, rows: DatasetContribution[];
  beforeAll(() => {
    input = historicalDatasetFixture();
    rows = buildHistoricalDataset(input);
  });
  it('emits unique deterministic identities for registered definition/subject/horizon cells and remains unchanged on replay', () => {
    expect(new Set(DATASET_DEFINITIONS.map((d) => d.id)).size).toBe(
      DATASET_DEFINITIONS.length,
    );
    expect(
      DATASET_DEFINITIONS.find((d) => d.id === 'events.soloKills'),
    ).toMatchObject({ metricId: 'E08' });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(buildHistoricalDataset(input)).toEqual(rows);
    for (const row of rows) {
      const definition = DATASET_DEFINITIONS.find(
        (d) => d.id === row.definitionId,
      )!;
      expect(definition).toBeDefined();
      expect(definition.subjectKinds).toContain(row.subjectKind);
      expect(row.usage).toBe(definition.usage);
      expect(row.id).toBe(
        contributionIdentity(
          row.matchId,
          row.subjectKind,
          row.subjectId,
          row.definitionId,
          row.definitionVersion,
          row.horizonKey,
        ),
      );
      expect(row.sampleCount).toBe(1);
      expect(row.validCount).toBe(row.value === null ? 0 : 1);
      expect(row.sumValue).toBe(row.value ?? 0);
      expect(row.playerIds).toEqual([...new Set(row.playerIds)].sort());
    }
    const first = rows[0];
    for (const id of [
      contributionIdentity(
        'other',
        first.subjectKind,
        first.subjectId,
        first.definitionId,
        first.definitionVersion,
        first.horizonKey,
      ),
      contributionIdentity(
        first.matchId,
        first.subjectKind,
        'other',
        first.definitionId,
        first.definitionVersion,
        first.horizonKey,
      ),
      contributionIdentity(
        first.matchId,
        first.subjectKind,
        first.subjectId,
        first.definitionId,
        first.definitionVersion + 1,
        first.horizonKey,
      ),
      contributionIdentity(
        first.matchId,
        first.subjectKind,
        first.subjectId,
        first.definitionId,
        first.definitionVersion,
        'other',
      ),
    ])
      expect(id).not.toBe(first.id);
  });
  it('preserves multiple discovery observations as lineage without multiplying analytical contributions', () => {
    const additional = historicalDatasetFixture();
    additional.lineage.observationIds.push('synthetic:search:third');
    additional.lineage.sources.push('search');
    const replay = buildHistoricalDataset(additional);
    expect(
      replay.map((r) => [r.id, r.value, r.validCount, r.sampleCount]),
    ).toEqual(rows.map((r) => [r.id, r.value, r.validCount, r.sampleCount]));
    expect(
      replay.every((r) =>
        r.lineage.observationIds.includes('synthetic:search:third'),
      ),
    ).toBe(true);
  });
  it('separates final observations/outcome labels from explicitly timestamped predictive horizons', () => {
    expect(rows.filter((r) => r.usage === 'label')).toHaveLength(
      input.participants.length + input.teams.length,
    );
    for (const p of input.participants) {
      expect(contribution(rows, 'label.win', p.puuid)).toMatchObject({
        value: p.win ? 1 : 0,
        usage: 'label',
        horizonKey: 'final',
        horizonMs: null,
      });
      expect(contribution(rows, 'final.gold', p.puuid)).toMatchObject({
        value: (p.finalStats as any).values.goldEarned,
        usage: 'descriptive',
        horizonMs: null,
      });
    }
    for (const row of rows.filter((r) => r.usage === 'predictive')) {
      expect(DATASET_HORIZONS).toContain(row.horizonMs);
      expect(row.horizonKey).toBe(`t:${row.horizonMs}`);
      expect(
        row.definitionId.startsWith('final.') ||
          row.definitionId.startsWith('label.'),
      ).toBe(false);
      if (row.value !== null)
        expect(row.sourceMaxTimestampMs!).toBeLessThanOrEqual(row.horizonMs!);
    }
  });
  it('retains numerator/denominator and scale for per-minute rates and percentages instead of averaging ratios', () => {
    const p = input.participants[0],
      stats = (p.finalStats as any).values;
    const team = input.participants.filter(
      (other) => other.teamId === p.teamId,
    );
    const share = contribution(rows, 'final.goldShare', p.puuid);
    expect(share.denominatorValue).toBe(
      team.reduce(
        (sum, other) => sum + (other.finalStats as any).values.goldEarned,
        0,
      ),
    );
    expect(share.numerator!).toBeCloseTo(stats.goldEarned, 8);
    expect(share.ratioScale).toBe(100);
    expect(share.value!).toBeCloseTo(
      (share.numerator! / share.denominatorValue!) * share.ratioScale,
      10,
    );
    const rate = contribution(rows, 'final.goldPerMinute', p.puuid);
    expect(rate.denominatorValue).toBe(stats.timePlayed);
    expect(rate.numerator!).toBeCloseTo(stats.goldEarned, 8);
    expect(rate.ratioScale).toBe(60);
    const kp = contribution(rows, 'final.killParticipation', p.puuid);
    expect(kp.numerator!).toBeCloseTo(p.kills + p.assists, 8);
    expect(kp.denominatorValue).toBe(team.reduce((sum, p) => sum + p.kills, 0));
  });
  it('distinguishes an observed zero from unavailable denominator using validCount, while preserving cohort and unknown lineage', () => {
    const zero = historicalDatasetFixture();
    for (const p of zero.participants)
      (p.finalStats as any).values.goldEarned = 0;
    zero.lineage = {
      observationIds: [],
      sources: [],
      status: 'unknown',
      reason: 'historical_origin_unknown',
    };
    const built = buildHistoricalDataset(zero),
      p = zero.participants[0];
    expect(contribution(built, 'final.gold', p.puuid)).toMatchObject({
      value: 0,
      sumValue: 0,
      validCount: 1,
      sampleCount: 1,
    });
    expect(contribution(built, 'final.goldShare', p.puuid)).toMatchObject({
      value: null,
      sumValue: 0,
      validCount: 0,
      sampleCount: 1,
      numerator: null,
      denominatorValue: 0,
      reason: 'zero_denominator',
    });
    expect(
      built.every(
        (r) =>
          r.lineage.status === 'unknown' &&
          r.lineage.observationIds.length === 0,
      ),
    ).toBe(true);
    expect(contribution(built, 'final.gold', p.puuid)).toMatchObject({
      queueId: 420,
      mapId: 11,
      patch: '16.2',
      championId: p.championId,
      teamId: p.teamId,
      eligible: true,
    });
  });
});
