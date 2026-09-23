import {
  calculateSequences,
  SequenceEvent,
  SequencesInput,
} from './sequences-calculator';
import { sequencesFixture } from '../../../../test/fixtures/sequences';
const report = (f: SequencesInput) => calculateSequences(f).report!;
function small(): SequencesInput {
  const f = sequencesFixture();
  f.events = [];
  const template = sequencesFixture().events.find(
    (e) => e.type === 'CHAMPION_KILL',
  )!;
  const blue = f.participants.find((p) => p.teamId === 100)!.puuid;
  const red = f.participants.find((p) => p.teamId === 200)!.puuid;
  const event = (
    type: string,
    timestampMs: number,
    index: number,
    beneficiary = 200,
  ): SequenceEvent => ({
    ...template,
    type,
    timestampMs,
    frameIndex: 1,
    eventIndex: index,
    sourceTeamId: 200,
    beneficiaryTeamId: beneficiary,
    victimPuuid: blue,
    actorPuuid: red,
    payload: { monsterType: 'BARON_NASHOR' },
  });
  f.events = [
    event('CHAMPION_KILL', 10_000, 0),
    event('ELITE_MONSTER_KILL', 10_000, 1),
    event('ELITE_MONSTER_KILL', 70_000, 2),
    event('BUILDING_KILL', 70_001, 3),
    event('GAME_END', 70_000, 4),
  ];
  f.events = f.events.filter((e) => e.eventIndex !== 3);
  return f;
}
describe('MET15 traceable event sequences', () => {
  it('reconciles the five red kills preceding first Baron and blue persistent lead at minute28', () => {
    const r = report(sequencesFixture());
    const baron = r.goldChanges.find(
      (e) => e.objective.objective === 'BARON_NASHOR',
    )!;
    const kills = r.killEpisodes.filter(
      (e) =>
        e.windowMs === 60_000 &&
        e.subjectId === '200' &&
        e.objectives.some((o) => o.eventId === baron.objective.eventId),
    );
    expect(kills).toHaveLength(5);
    expect(new Set(kills.map((e) => e.event.eventId)).size).toBe(5);
    expect(r.comeback.firstPersistentLead).toMatchObject({
      frameIndex: 28,
      timestampMs: 1680598,
      winnerGoldAdvantage: 455,
    });
    expect(r.comeback.largestObservedDeficit.value).toBe(4750);
    expect(baron.delta.value).toBe(2606);
    expect(baron.before).toMatchObject({
      frameIndex: 20,
      timestampMs: 1200462,
      offsetMs: -44088,
    });
    expect(baron.after).toMatchObject({
      frameIndex: 23,
      timestampMs: 1380506,
      offsetMs: -44044,
    });
  });
  it('uses strict-after inclusive-end windows; a full 60s death has one episode with several objectives', () => {
    const f = small();
    f.events.push({ ...f.events[2], eventIndex: 5, type: 'BUILDING_KILL' });
    const r = report(f),
      e = r.deathEpisodes[0];
    expect(e.eligible).toBe(true);
    expect(e.objectives).toHaveLength(2);
    expect(e.objectives.every((o) => o.timestampMs === 70_000)).toBe(true);
    expect(
      r.deathRates.find((x) => x.subjectId === e.subjectId)!.rate,
    ).toMatchObject({ value: 100, denominator: { value: 1 } });
    expect(
      r.killRates.find((x) => x.subjectId === '200' && x.windowMs === 90_000),
    ).toMatchObject({
      eligibleEvents: 0,
      censoredEvents: 1,
      rate: { value: null, reason: 'zero_denominator' },
    });
  });
  it('retains observed objectives in censored episodes without counting them in the eligible denominator', () => {
    const f = small();
    f.events[0].timestampMs = 20_000;
    const r = report(f);
    expect(r.deathEpisodes[0]).toMatchObject({
      eligible: false,
      reason: 'short_match',
    });
    expect(r.deathEpisodes[0].objectives).toHaveLength(1);
    expect(r.killRates[2]).toMatchObject({
      eligibleEvents: 0,
      associatedEvents: 0,
      censoredEvents: 1,
      rate: { value: null, reason: 'zero_denominator' },
    });
  });
  it('deduplicates equal identities and rejects conflicting identities and cross-generation events', () => {
    const f = small();
    f.events.push({ ...f.events[0] });
    expect(report(f).coverage.identicalDuplicatesRemoved).toBe(1);
    expect(report(f).deathEpisodes).toHaveLength(1);
    f.events.at(-1)!.timestampMs = 11_000;
    expect(calculateSequences(f)).toMatchObject({
      report: null,
      reason: 'invalid_value',
    });
    f.events.pop();
    f.events[0].processingVersion = 1;
    expect(calculateSequences(f).reason).toBe('unsupported_version');
  });
  it('does not turn missing end markers, timestamps, identities or provenance into zero rates', () => {
    const f = small();
    f.events = f.events.filter((e) => e.type !== 'GAME_END');
    expect(report(f).deathRates[0].rate.reason).toBe('incomplete_events');
    f.events[0].timestampMs = null;
    expect(report(f).coverage.invalidTimestampEvents).toBe(1);
    f.processing = null;
    expect(calculateSequences(f)).toMatchObject({
      processedAt: null,
      processingVersion: null,
      report: null,
      reason: 'not_calculated',
    });
    const missing = small();
    missing.events[2].beneficiaryTeamId = null;
    expect(report(missing).killRates[2].rate.reason).toBe('missing_field');
  });
  it('distinguishes observed zero from no eligible triggers and ignores unrelated unknown future event types', () => {
    const f = small();
    f.events = f.events.filter((e) => e.type !== 'ELITE_MONSTER_KILL');
    f.events.push({
      ...f.events[0],
      eventIndex: 20,
      type: 'FUTURE_UNKNOWN',
      timestampMs: null,
    });
    const r = report(f);
    expect(
      r.killRates.find((x) => x.subjectId === '200' && x.windowMs === 60_000)!
        .rate.value,
    ).toBe(0);
    expect(r.killRates.find((x) => x.subjectId === '100')!.rate.reason).toBe(
      'zero_denominator',
    );
    expect(r.coverage.invalidTimestampEvents).toBe(0);
  });
  it('emits opposing unordered temporal pairs once including simultaneous captures', () => {
    const f = small();
    f.events.push({ ...f.events[2], eventIndex: 10, beneficiaryTeamId: 100 });
    const pairs = report(f).temporalTrades;
    expect(pairs).toHaveLength(2);
    expect(pairs.some((p) => p.elapsedMs === 0)).toBe(true);
    expect(
      new Set(
        pairs.map((p) => [p.first.eventId, p.second.eventId].sort().join('|')),
      ).size,
    ).toBe(pairs.length);
  });
  it('uses real winner even when it ends behind in gold', () => {
    const f = sequencesFixture();
    f.teams = f.teams.map((t) => ({ ...t, win: !t.win }));
    const r = report(f);
    expect(r.comeback.winnerTeamId).toBe(200);
    expect(r.comeback.firstPersistentLead).toBeNull();
    expect(r.comeback.largestObservedDeficit.value).toBeGreaterThan(0);
  });
  it('does not substitute future or stale frames and marks objectives without complete followup', () => {
    const f = sequencesFixture();
    const first = report(f).goldChanges[0];
    const beforeIndex = first.before!.frameIndex;
    f.projection!.frames = f.projection!.frames.filter(
      (frame) => frame.frameIndex !== beforeIndex,
    );
    const r = report(f);
    expect(r.goldChanges[0].before).toBeNull();
    expect(r.goldChanges[0].delta.reason).toBe('missing_frame');
    expect(r.goldChanges.some((o) => o.delta.reason === 'short_match')).toBe(
      true,
    );
    for (const g of r.goldChanges)
      for (const frame of [g.before, g.after])
        if (frame) expect(frame.offsetMs).toBeLessThanOrEqual(0);
    f.projection = null;
    expect(report(f).comeback.largestObservedDeficit.reason).toBe(
      'missing_projection',
    );
  });
  it('does not bridge a missing final snapshot into a persistence claim or infer unknown winner', () => {
    const f = sequencesFixture();
    const last = f.projection!.frames.at(-1)!;
    Object.values(last.participantFrames)[0].totalGold = null;
    expect(report(f).comeback.firstPersistentLead).toBeNull();
    f.teams = [];
    expect(report(f).comeback.largestObservedDeficit.reason).toBe(
      'missing_field',
    );
  });
});
