import {
  calculateBountiesSteals,
  STEAL_CHALLENGES,
} from './bounties-steals-calculator';
import { bountiesFixture } from '../../../../test/fixtures/bounties';
describe('O10/O11 bounty and steal report', () => {
  it('reconciles fixture start1260000 vs announcement1245318 and finish1555457, preserves every independent literal', () => {
    const f = bountiesFixture(),
      before = JSON.stringify(f),
      r = calculateBountiesSteals(f).report!;
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0]).toMatchObject({
      teamId: 100,
      announcementTimestampMs: 1245318,
      startMs: 1260000,
      startSource: 'actualStartTime',
      endMs: 1555457,
      observedDuration: {
        value: 295457,
        unit: 'milliseconds',
        origin: 'derived',
        window: { bounds: '[)' },
      },
    });
    expect(r.literalRewards).toHaveLength(119);
    for (const p of f.participants) {
      const actual = r.participants.find((a) => a.puuid === p.puuid)!;
      expect(actual.objectivesStolen.value).toBe(
        (p.finalStats as any).values.objectivesStolen,
      );
      expect(actual.objectivesStolenAssists.value).toBe(
        (p.finalStats as any).values.objectivesStolenAssists,
      );
      for (const field of Object.keys(STEAL_CHALLENGES))
        expect(actual.challenges[field].metric.value).toBe(
          (p.challenges as any)[field] ?? null,
        );
      expect(actual.bountyGold.value).toBe((p.challenges as any).bountyGold);
      expect(actual.bountyGold.metricId).toBe('C08');
    }
    for (const reward of r.literalRewards) {
      const metricId = reward.type === 'CHAMPION_KILL' ? 'C08' : 'O10';
      expect(reward.bounty.metricId).toBe(metricId);
      expect(reward.shutdownBounty.metricId).toBe(metricId);
      const source = f.events.find(
        (e) =>
          `${e.matchId}:${e.frameIndex}:${e.eventIndex}` === reward.eventId,
      )!;
      expect(reward.bounty.value).toBe((source.payload as any).bounty ?? null);
      expect(reward.shutdownBounty.value).toBe(
        (source.payload as any).shutdownBounty ?? null,
      );
    }
    expect(
      r.participants.find((p) => p.championName === 'Karthus')!.challenges
        .epicMonsterKillsNearEnemyJungler.metric.value,
    ).toBe(2);
    expect(r.participants.every((p) => p.objectivesStolen.value === 0)).toBe(
      true,
    );
    expect(JSON.stringify(f)).toBe(before);
  });
  it('distinguishes missing counters from zero and proximity from steals without inventing attempts or event attribution', () => {
    const f = bountiesFixture();
    const p = f.participants[0];
    p.challenges = {
      epicMonsterSteals: 0,
      epicMonsterKillsNearEnemyJungler: 4,
      bountyGold: 1.25,
    };
    p.finalStats = null;
    const r = calculateBountiesSteals(f).report!.participants[0];
    expect(r.objectivesStolen).toMatchObject({
      value: null,
      reason: 'missing_projection',
    });
    expect(r.challenges.epicMonsterSteals.metric.value).toBe(0);
    expect(r.challenges.epicMonsterStolenWithoutSmite.metric).toMatchObject({
      value: null,
      reason: 'missing_field',
    });
    expect(r.challenges.epicMonsterKillsNearEnemyJungler).toMatchObject({
      category: 'proximity',
      metric: { value: 4 },
    });
    expect(r.bountyGold.value).toBe(1.25);
    expect(r).not.toHaveProperty('successRate');
  });
  it('keeps bounty and shutdown separate even for unknown author, preserving zero rather than inferring a reward', () => {
    const f = bountiesFixture(),
      event = f.events.find((e) => e.type === 'CHAMPION_KILL')!;
    event.actorPuuid = null;
    event.payload = { killerId: 0, bounty: 300, shutdownBounty: 125 };
    const reward = calculateBountiesSteals(f).report!.literalRewards.find(
      (r) =>
        r.eventId ===
        `${event.matchId}:${event.frameIndex}:${event.eventIndex}`,
    )!;
    expect(reward).toMatchObject({
      actorPuuid: null,
      actorReason: 'missing_field',
      bounty: { value: 300 },
      shutdownBounty: { value: 125 },
    });
    expect(reward).not.toHaveProperty('totalReward');
  });
  it('provides an estimated announcement fallback and a censored observation with terminal evidence', () => {
    const f = bountiesFixture(),
      start = f.events.find((e) => e.type === 'OBJECTIVE_BOUNTY_PRESTART')!;
    delete (start.payload as any).actualStartTime;
    let window = calculateBountiesSteals(f).report!.windows[0];
    expect(window.observedDuration.origin).toBe('estimated');
    expect(window.startMs).toBe(1245318);
    f.events = f.events.filter((e) => e.type !== 'OBJECTIVE_BOUNTY_FINISH');
    window = calculateBountiesSteals(f).report!.windows[0];
    expect(window).toMatchObject({ endMs: null, censoredEnd: true });
    expect(window.observedDuration.value).toBe(
      window.observedEndMs! - window.startMs!,
    );
    const terminal = f.events.find((e) => e.type === 'GAME_END')!;
    expect(
      window.evidence.some(
        (e) =>
          e.eventId ===
          `${terminal.matchId}:${terminal.frameIndex}:${terminal.eventIndex}`,
      ),
    ).toBe(true);
  });
  it('uses half-open closed intervals and cannot count unknown beneficiary/time as an observed zero', () => {
    const f = bountiesFixture(),
      objective = f.events.find((e) => e.type === 'ELITE_MONSTER_KILL')!;
    objective.timestampMs = 1260000;
    objective.beneficiaryTeamId = 100;
    const id = `${objective.matchId}:${objective.frameIndex}:${objective.eventIndex}`;
    expect(
      calculateBountiesSteals(f).report!.windows[0].associatedObjectiveEventIds,
    ).toContain(id);
    objective.timestampMs = 1555457;
    expect(
      calculateBountiesSteals(f).report!.windows[0].associatedObjectiveEventIds,
    ).not.toContain(id);
    objective.timestampMs = 1300000;
    objective.beneficiaryTeamId = null;
    expect(
      calculateBountiesSteals(f).report!.windows[0].associatedObjectiveCount
        .reason,
    ).toBe('missing_field');
  });
  it('makes unknown versions/provenance explicit and limits cross-patch claims to literal fields', () => {
    const f = bountiesFixture();
    f.processing = null;
    expect(calculateBountiesSteals(f)).toMatchObject({
      report: null,
      processingVersion: null,
      processedAt: null,
      reason: 'missing_projection',
    });
    const g = bountiesFixture();
    g.events[0].processingVersion = 99;
    // first source event can be an unselected type; mutate an actual selected boundary.
    g.events.find(
      (e) => e.type === 'OBJECTIVE_BOUNTY_PRESTART',
    )!.processingVersion = 99;
    expect(calculateBountiesSteals(g)).toMatchObject({
      report: null,
      reason: 'unsupported_version',
    });
    const h = bountiesFixture();
    h.gameVersion = '99.1.1';
    expect(
      calculateBountiesSteals(h).report!.contracts.currentPatchFixtureValidated,
    ).toBe(false);
    (h.participants[0].challenges as any).epicMonsterSteals = '0';
    expect(
      calculateBountiesSteals(h).report!.participants[0].challenges
        .epicMonsterSteals.metric.reason,
    ).toBe('invalid_value');
    h.participants[0].finalStats = {
      projectionVersion: 99,
      values: { objectivesStolen: 0 },
    };
    expect(
      calculateBountiesSteals(h).report!.participants[0].objectivesStolen
        .reason,
    ).toBe('unsupported_version');
  });
});
