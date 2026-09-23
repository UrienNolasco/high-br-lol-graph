import { contributionFixture } from '../../../../test/fixtures/contribution';
import { computeContribution } from './contribution-calculator';

const values = (participant: { finalStats: unknown }) =>
  (participant.finalStats as any).values;
function scenario(champion = 'Fiora') {
  const fixture = contributionFixture();
  const input = {
    ...fixture.match,
    processingVersion: 2,
    processedAt: fixture.processing.completedAt.toISOString(),
  };
  const player = input.participants.find((p) => p.championName === champion)!;
  const team = input.participants.filter((p) => p.teamId === player.teamId);
  return { ...fixture, input, player, team };
}

describe('separate contribution dimensions', () => {
  it('reconciles Fiora tower contribution and Milio ally shields using the real fixture', () => {
    const fiora = scenario();
    const result = computeContribution(fiora.input, fiora.player);
    expect(
      result.dimensions.structures.turretDamage.teamShare.value,
    ).toBeCloseTo(79.14, 2);
    const source = fiora.raw.info.participants.find(
      (p) => p.puuid === fiora.player.puuid,
    );
    const kills = fiora.raw.info.participants
      .filter((p) => p.teamId === source.teamId)
      .reduce((n, p) => n + p.kills, 0);
    expect(result.dimensions.combat.killParticipation.value).toBe(
      ((source.kills + source.assists) / kills) * 100,
    );
    expect(result.dimensions.resources.cs.absolute.value).toBe(
      source.totalMinionsKilled + source.neutralMinionsKilled,
    );
    const milio = scenario('Milio');
    const support = computeContribution(milio.input, milio.player);
    expect(support.dimensions.combat.allyShielding.absolute.value).toBe(19049);
    expect(support.roleExplanation).toContain('suporte');
    expect(result).not.toHaveProperty('score');
  });

  it('never includes self/total healing in ally healing', () => {
    const s = scenario('Milio');
    values(s.player).totalHeal = 999999;
    values(s.player).totalHealsOnTeammates = 0;
    const healing = computeContribution(s.input, s.player).dimensions.combat
      .allyHealing;
    expect(healing.absolute.value).toBe(0);
    expect(healing.perMinute.value).toBe(0);
    expect(healing.absolute.evidence[0].field).toContain(
      'totalHealsOnTeammates',
    );
  });

  it('returns absence for KP/damage/gold denominators and the ratio of shares when team totals are zero', () => {
    const s = scenario();
    for (const p of s.team) {
      p.kills = p.assists = 0;
      values(p).goldEarned = 0;
      values(p).totalDamageDealtToChampions = 0;
    }
    const d = computeContribution(s.input, s.player).dimensions;
    for (const metric of [
      d.combat.killParticipation,
      d.combat.damage.teamShare,
      d.resources.gold.teamShare,
      d.combat.damageToGoldShareRatio,
    ]) {
      expect(metric).toMatchObject({
        value: null,
        origin: 'unavailable',
        reason: 'zero_denominator',
      });
    }
    expect(d.resources.gold.absolute).toMatchObject({
      value: 0,
      origin: 'observed',
      reason: null,
    });
    expect(d.resources.largestGoldHolders).toEqual([]);
  });

  it('keeps zero player gold share valid but makes damage/gold share ratio unavailable', () => {
    const s = scenario();
    values(s.player).goldEarned = 0;
    const d = computeContribution(s.input, s.player).dimensions;
    expect(d.resources.gold.teamShare.value).toBe(0);
    expect(d.combat.damageToGoldShareRatio.reason).toBe('zero_denominator');
  });

  it('does not sum missing teammate damage or omit incomplete roster members from denominators', () => {
    const s = scenario();
    const other = s.team.find((p) => p !== s.player)!;
    values(other).totalDamageDealtToChampions = null;
    let d = computeContribution(s.input, s.player).dimensions;
    expect(d.combat.damage.teamShare).toMatchObject({
      value: null,
      reason: 'missing_field',
      denominator: { value: null },
      quality: { validSamples: 4, totalSamples: 5, coverage: 0.8 },
    });
    expect(d.combat.damage.absolute.value).not.toBeNull();
    s.input.participants = s.input.participants.filter((p) => p !== other);
    d = computeContribution(s.input, s.player).dimensions;
    expect(d.resources.gold.teamShare.reason).toBe('insufficient_sample');
    expect(d.resources.gold.teamShare.denominator?.value).toBeNull();
  });

  it('uses actual timePlayed and sums team time in player-seconds', () => {
    const s = scenario();
    for (const p of s.team) {
      values(p).timePlayed = 100;
      values(p).totalTimeSpentDead = 20;
    }
    values(s.player).timePlayed = 50;
    values(s.player).totalTimeSpentDead = 10;
    values(s.player).goldEarned = 300;
    const d = computeContribution(s.input, s.player).dimensions;
    expect(d.resources.gold.perMinute.value).toBe(360);
    expect(d.combat.deadTimePercent.value).toBe(20);
    expect(d.combat.teamDeadTime).toMatchObject({
      value: 90,
      unit: 'player_seconds',
      subject: { kind: 'team' },
    });
    expect(d.combat.teamTimePlayed).toMatchObject({
      value: 450,
      unit: 'player_seconds',
    });
    expect(d.combat.teamDeadTimePercent).toMatchObject({
      value: 20,
      denominator: { value: 450, unit: 'player_seconds' },
    });
    values(s.player).timePlayed = 0;
    expect(
      computeContribution(s.input, s.player).dimensions.combat.deadTimePercent
        .reason,
    ).toBe('zero_denominator');
    values(s.player).timePlayed = null;
    expect(
      computeContribution(s.input, s.player).dimensions.resources.gold.perMinute
        .reason,
    ).toBe('missing_field');
  });

  it('preserves all tied resource leaders without arbitrary ordering or selecting a winner', () => {
    const s = scenario();
    s.team.forEach((p) => (values(p).goldEarned = 100));
    const resource = computeContribution(s.input, s.player).dimensions
      .resources;
    expect(resource.teamGoldConcentration.value).toBe(20);
    expect(resource.largestGoldHolders).toEqual(
      s.team.map((p) => p.puuid).sort(),
    );
  });

  it('handles unsupported projections/maps, duplicate roster identities, and overflow without invalid JSON', () => {
    const s = scenario();
    (s.player.finalStats as any).projectionVersion = 99;
    expect(
      computeContribution(s.input, s.player).dimensions.resources.gold.absolute
        .reason,
    ).toBe('unsupported_version');
    (s.player.finalStats as any).projectionVersion = 1;
    s.input.mapId = 30;
    expect(
      computeContribution(s.input, s.player).dimensions.resources.gold.teamShare
        .reason,
    ).toBe('unsupported_version');
    s.input.mapId = 11;
    s.input.participants.push(s.player);
    expect(
      computeContribution(s.input, s.player).dimensions.resources.gold.teamShare
        .reason,
    ).toBe('invalid_value');
    s.input.participants.pop();
    s.team.forEach((p) => (values(p).goldEarned = Number.MAX_VALUE));
    const result = computeContribution(s.input, s.player);
    expect(result.dimensions.resources.gold.teamShare.reason).toBe(
      'invalid_value',
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('publishes finite metric values or explicit absence, with exact persisted processing metadata and source evidence', () => {
    const s = scenario();
    s.player.role = 'MID';
    const result = computeContribution(s.input, s.player);
    expect(result.role).toBe('MIDDLE');
    let metrics = 0;
    const walk = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if ('metricId' in value) {
        metrics++;
        expect(value.processingVersion).toBe(2);
        expect(value.processedAt).toBe(s.input.processedAt);
        expect(value.evidence.length).toBeGreaterThan(0);
        if (value.value === null) {
          expect(value.origin).toBe('unavailable');
          expect(value.reason).not.toBeNull();
        } else {
          expect(Number.isFinite(value.value)).toBe(true);
          expect(value.reason).toBeNull();
        }
      }
      Object.values(value).forEach(walk);
    };
    walk(result);
    expect(metrics).toBeGreaterThan(40);
  });
});
