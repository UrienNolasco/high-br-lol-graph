import {
  calculateObjectives,
  objectivePhase,
  objectiveEventId,
} from './objectives-calculator';
import { objectivesFixture } from '../../../../test/fixtures/objectives';

describe('O01–O04 objective projections', () => {
  it('reconciles twelve final/team counts, 13 towers, 2 inhibitors and every one of 74 plates', () => {
    const fixture = objectivesFixture(),
      before = JSON.stringify(fixture);
    const { report } = calculateObjectives(fixture);
    expect(report!.reconciliation).toHaveLength(12);
    expect(
      report!.reconciliation.every((r) => r.matches && r.difference === 0),
    ).toBe(true);
    expect(report!.structures.towers.value).toBe(13);
    expect(report!.structures.inhibitors.value).toBe(2);
    expect(report!.plates.total.value).toBe(74);
    expect(report!.plates.killerIdZero.value).toBe(28);
    expect(report!.plates.groups.reduce((n, g) => n + g.count.value!, 0)).toBe(
      74,
    );
    expect(
      report!.chronology.filter(
        (e) => e.objective === 'plate' && e.timestampMs! >= 840000,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      report!.chronology.find((e) => e.objective === 'soul'),
    ).toMatchObject({
      beneficiaryTeamId: null,
      beneficiaryReason: 'missing_field',
    });
    expect(
      report!.chronology
        .filter((e) => e.objective === 'plate' && e.sourceKillerId === 0)
        .every((e) => e.actorPuuid === null),
    ).toBe(true);
    const tower = report!.chronology.find((e) => e.objective === 'tower')!;
    expect(tower).toMatchObject({
      ownerTeamId: 200,
      beneficiaryTeamId: 100,
      lane: 'TOP_LANE',
      tier: 'OUTER_TURRET',
    });
    expect(tower.evidence[0].eventId).toBe(tower.eventId);
    expect(JSON.stringify(fixture)).toBe(before);
    const fiora = report!.participantContributions.find(
      (p) => p.championName === 'Fiora',
    )!;
    expect(fiora.turretDamageShare.value).toBeCloseTo(79.14, 2);
    expect(fiora.turretDamageShare.denominator?.population).toContain(
      'five distinct',
    );
  });
  it('counts registered author or assistant once, preserves missing list and does not equate damage/takedowns/last hits', () => {
    const f = objectivesFixture(),
      actor = f.participants[0],
      assistant = f.participants[1];
    const tower = f.events.find((e) => e.type === 'BUILDING_KILL')!;
    tower.actorPuuid = actor.puuid;
    tower.assistingPuuids = [actor.puuid, assistant.puuid, assistant.puuid];
    tower.assistingParticipantIds = [1, 2, 2];
    f.events = [tower, ...f.events.filter((e) => e.type === 'GAME_END')];
    const r = calculateObjectives(f).report!;
    const a = r.participantContributions.find((p) => p.puuid === actor.puuid)!;
    const b = r.participantContributions.find(
      (p) => p.puuid === assistant.puuid,
    )!;
    expect(a.registeredEvents.tower.lastHits.value).toBe(1);
    expect(a.registeredEvents.tower.participations.value).toBe(1);
    expect(b.registeredEvents.tower.lastHits.value).toBe(0);
    expect(b.registeredEvents.tower.participations.value).toBe(1);
    expect(a.turretDamage.origin).toBe('observed');
    expect(a.turretTakedowns.method).toContain('not interchangeable');
    expect(r.reconciliation.some((r) => r.matches === false)).toBe(true);
  });
  it('preserves literal zero and rejects zero/missing/partial roster damage denominators', () => {
    const f = objectivesFixture();
    for (const p of f.participants)
      (p.finalStats as any).values.damageDealtToTurrets = 0;
    let r = calculateObjectives(f).report!.participantContributions[0];
    expect(r.turretDamage.value).toBe(0);
    expect(r.turretDamageShare.reason).toBe('zero_denominator');
    (f.participants[1].finalStats as any).values.damageDealtToTurrets = null;
    r = calculateObjectives(f).report!.participantContributions[0];
    expect(r.turretDamageShare).toMatchObject({
      value: null,
      reason: 'missing_field',
      quality: { coverage: 0.8 },
      denominator: { value: null },
    });
    f.participants.splice(1, 1);
    expect(
      calculateObjectives(f).report!.participantContributions[0]
        .turretDamageShare,
    ).toMatchObject({
      reason: 'insufficient_sample',
      denominator: { value: null },
    });
  });
  it('does not invent provenance, accept mixed generations or count duplicate source identities', () => {
    const f = objectivesFixture();
    f.processing = null;
    expect(calculateObjectives(f)).toMatchObject({
      report: null,
      reason: 'not_calculated',
      processedAt: null,
      processingVersion: null,
    });
    const g = objectivesFixture();
    g.events.find((e) => e.type === 'BUILDING_KILL')!.processingVersion = 99;
    expect(calculateObjectives(g)).toMatchObject({
      report: null,
      reason: 'unsupported_version',
    });
    const h = objectivesFixture();
    h.events.push(h.events.find((e) => e.type === 'BUILDING_KILL')!);
    expect(calculateObjectives(h)).toMatchObject({
      report: null,
      reason: 'invalid_value',
    });
  });
  it('keeps final totals readable with missing terminal/time but makes aggregate timeline values unavailable', () => {
    const f = objectivesFixture();
    f.events = f.events.filter((e) => e.type !== 'GAME_END');
    let r = calculateObjectives(f).report!;
    expect(r.plates.total).toMatchObject({
      value: null,
      reason: 'missing_frame',
    });
    expect(r.reconciliation.every((r) => r.matches === null)).toBe(true);
    expect(r.finalTotals[0].objectives.tower.kills.value).toBe(7);
    const g = objectivesFixture();
    g.events.find((e) => e.type === 'TURRET_PLATE_DESTROYED')!.timestampMs =
      null;
    r = calculateObjectives(g).report!;
    expect(r.coverage.completeTimeline).toBe(false);
    expect(r.chronology.find((e) => e.timestampMs === null)?.phase).toBeNull();
  });
  it('preserves unknown objective categories and attribution without claiming reconciliation or assigning soul to a winner', () => {
    const f = objectivesFixture();
    const event = f.events.find((e) => e.type === 'ELITE_MONSTER_KILL')!;
    (event.payload as any).monsterType = 'FUTURE_EPIC';
    let r = calculateObjectives(f).report!;
    expect(
      r.chronology.find((e) => e.eventId === objectiveEventId(event)),
    ).toMatchObject({ objective: null, rawObjectiveType: 'FUTURE_EPIC' });
    expect(
      r.reconciliation.find((r) => r.objective === 'dragon')!.timelineCount
        .reason,
    ).toBe('unsupported_version');
    const g = objectivesFixture();
    g.events.find((e) => e.type === 'ELITE_MONSTER_KILL')!.beneficiaryTeamId =
      null;
    r = calculateObjectives(g).report!;
    expect(
      r.reconciliation.find((r) => r.objective === 'dragon')!.timelineCount
        .reason,
    ).toBe('missing_field');
  });
  it('uses explicit phase boundaries including the last game event, without a universal plate cutoff', () => {
    expect(
      [null, 839999, 840000, 1499999, 1500000].map(objectivePhase),
    ).toEqual([null, 'early', 'mid', 'mid', 'late']);
    const f = objectivesFixture(),
      plate = f.events.find((e) => e.type === 'TURRET_PLATE_DESTROYED')!;
    plate.timestampMs = f.events.find(
      (e) => e.type === 'GAME_END',
    )!.timestampMs;
    expect(calculateObjectives(f).report!.plates.total.value).toBe(74);
    plate.timestampMs!++;
    expect(calculateObjectives(f).report!.plates.total.reason).toBe(
      'missing_frame',
    );
  });
  it('keeps absent and unsupported final stats distinct, avoids overflow and labels unknown maps', () => {
    const f = objectivesFixture();
    f.participants[0].finalStats = null;
    expect(
      calculateObjectives(f).report!.participantContributions[0].turretDamage
        .reason,
    ).toBe('not_calculated');
    f.participants[0].finalStats = {
      projectionVersion: 99,
      values: { damageDealtToTurrets: 0 },
    };
    expect(
      calculateObjectives(f).report!.participantContributions[0].turretDamage
        .reason,
    ).toBe('unsupported_version');
    const g = objectivesFixture();
    g.teams[0].finalObjectives = null;
    expect(
      calculateObjectives(g).report!.finalTotals[0].objectives.tower.kills
        .reason,
    ).toBe('not_calculated');
    for (const p of g.participants)
      (p.finalStats as any).values.damageDealtToTurrets = Number.MAX_VALUE;
    expect(
      calculateObjectives(g).report!.participantContributions[0]
        .turretDamageShare.reason,
    ).toBe('invalid_value');
    g.mapId = 99;
    expect(
      calculateObjectives(g).report!.participantContributions[0]
        .turretDamageShare.reason,
    ).toBe('unsupported_version');
  });
});
