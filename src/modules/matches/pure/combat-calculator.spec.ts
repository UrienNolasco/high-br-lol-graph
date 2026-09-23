import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTimelineEvents } from '../../../core/riot/normalized-events';
import { TimelineDto } from '../../../core/riot/dto/timeline.dto';
import { MatchDto } from '../../../core/riot/dto/match.dto';
import {
  calculateCombat,
  calculateSoloCheckpoints,
  CombatInput,
} from './combat-calculator';
import { combatFixture, killEvent } from './combat.fixture';

const player = (input: CombatInput, puuid = 'a') =>
  calculateCombat(input).participants.find((p) => p.puuid === puuid)!;
describe('MET13 combat projections', () => {
  it('reconciles all 10 K/D/A counts in the real 41-frame fixture without treating absent assistants as empty', () => {
    const summary = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../exemplo_partida_BR1_3200579475.json'),
        'utf8',
      ),
    ) as MatchDto;
    const timeline = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../../../../exemplo_partida_timeline_BR1_3200579475.json',
        ),
        'utf8',
      ),
    ) as TimelineDto;
    const input: CombatInput = {
      matchId: summary.metadata.matchId,
      gameDuration: summary.info.gameDuration,
      participants: summary.info.participants,
      projectionComplete: true,
      processingVersion: 2,
      processedAt: '2026-09-23T00:00:00.000Z',
      events: normalizeTimelineEvents(
        timeline,
        new Map(
          summary.info.participants.map((p) => [p.participantId, p.puuid]),
        ),
        new Map(
          summary.info.participants.map((p) => [p.participantId, p.teamId]),
        ),
      ).map((e) => ({ ...e, processingVersion: 2 })),
    };
    const result = calculateCombat(input);
    expect(timeline.info.frames).toHaveLength(41);
    expect(result.quality).toMatchObject({
      available: true,
      uniqueKillEvents: 92,
      unknownAssistanceEvents: 26,
      summaryKillDeathMismatch: false,
    });
    for (const p of result.participants)
      for (const kind of ['kills', 'deaths', 'assists'])
        expect(p.reconciliation[kind]).toMatchObject({
          matches: true,
          difference: 0,
        });
    expect(
      result.killerVictimMatrix.reduce((sum, edge) => sum + edge.count, 0),
    ).toBe(92);
    expect(
      result.participants.reduce(
        (sum, p) => sum + p.rewards.bountyReceived.value!,
        0,
      ),
    ).toBe(27478);
    expect(
      result.participants.reduce(
        (sum, p) => sum + p.rewards.shutdownReceived.value!,
        0,
      ),
    ).toBe(2917);
    expect(
      result.participants.some(
        (p) => p.soloKills15.reason === 'unknown_assistance',
      ),
    ).toBe(true);
    expect(
      result.participants.every(
        (p) => p.soloKills15.value === null || p.soloKills15.value === 0,
      ),
    ).toBe(true);
    expect(
      result.coParticipation.every(
        (edge) =>
          edge.count === new Set(edge.evidence.map((e) => e.eventId)).size,
      ),
    ).toBe(true);
  });
  it('counts explicit solo and uses disjoint phase windows and strict checkpoint upper bounds', () => {
    const input = combatFixture([
      killEvent(),
      killEvent({ eventIndex: 1, timestampMs: 600000 }),
      killEvent({ eventIndex: 2, timestampMs: 900000 }),
    ]);
    expect(player(input)).toMatchObject({
      soloKills10: { value: 1 },
      soloKills15: { value: 2 },
      kpByPhase: [{ value: 100 }, { value: 100 }, { value: 100 }],
    });
    expect(player(input, 'b').soloDeaths15.value).toBe(2);
    expect(player(input, 'c').soloKills15.value).toBe(0);
  });
  it.each([
    { assistingParticipantIds: null, assistingPuuids: null },
    {
      assistingParticipantIds: [],
      assistingPuuids: [],
      quality: { invalidFields: ['assistingParticipantIds[0]'] },
    },
    {
      assistingParticipantIds: [],
      assistingPuuids: [],
      quality: { sentinelFields: ['assistingParticipantIds[0]'] },
    },
    { assistingParticipantIds: [99], assistingPuuids: [null] },
  ])(
    'does not turn absent/invalid/unresolved assistants into solo: %j',
    (overrides) => {
      const input = combatFixture([killEvent(overrides)]);
      expect(player(input).soloKills15).toMatchObject({
        value: null,
        reason: 'unknown_assistance',
      });
      expect(player(input, 'c').kpByPhase[0]).toMatchObject({
        value: null,
        reason: 'unknown_assistance',
      });
      expect(player(input).kpByPhase[0].value).toBe(100);
    },
  );
  it('records assisted relations once and does not infer solo from incomplete lists with a known assistant', () => {
    const input = combatFixture([
      killEvent({
        assistingParticipantIds: [3, 3, 99],
        assistingPuuids: ['c', 'c', null],
      }),
    ]);
    const result = calculateCombat(input);
    expect(result.coParticipation).toHaveLength(1);
    expect(result.coParticipation[0]).toMatchObject({
      participantA: 'a',
      participantB: 'c',
      count: 1,
    });
    expect(player(input).soloKills15.value).toBe(0);
    expect(player(input, 'c').events.assists.value).toBe(1);
  });
  it('deduplicates identical identities and rejects conflicting ones', () => {
    const input = combatFixture();
    input.events.push({ ...input.events[0] });
    expect(player(input).events.kills.value).toBe(1);
    expect(calculateCombat(input).quality.duplicateIdentities).toBe(1);
    input.events[input.events.length - 1].timestampMs = 8;
    expect(player(input).events.kills.reason).toBe('invalid_value');
  });
  it('keeps environmental deaths without assigning a player author or solo death', () => {
    const input = combatFixture([
      killEvent({
        actorParticipantId: null,
        actorPuuid: null,
        payload: { killerId: 0, bounty: 0, shutdownBounty: 0 },
      }),
    ]);
    expect(calculateCombat(input).quality.environmentalDeaths).toBe(1);
    expect(calculateCombat(input).killerVictimMatrix).toEqual([]);
    expect(player(input, 'b')).toMatchObject({
      events: { deaths: { value: 1 } },
      soloDeaths15: { value: 0 },
    });
  });
  it('exposes unknown authors and missing victim rather than assigning player zero', () => {
    const input = combatFixture([
      killEvent({
        actorParticipantId: 99,
        actorPuuid: null,
        victimPuuid: null,
      }),
    ]);
    expect(player(input).events.kills.reason).toBe('missing_field');
    expect(player(input).events.deaths.reason).toBe('missing_field');
    expect(player(input).soloKills15.value).toBeNull();
    expect(calculateCombat(input).quality).toMatchObject({
      unresolvedActors: 1,
      unresolvedVictims: 1,
    });
  });
  it('requires observed GAME_END horizon and cannot prove completeness using duration alone', () => {
    const input = combatFixture([
      killEvent(),
      killEvent({
        type: 'GAME_END',
        eventIndex: 1,
        timestampMs: 850000,
        payload: { winningTeam: 100 },
      }),
    ]);
    expect(player(input).soloKills15.reason).toBe('short_match');
    expect(player(input).soloKills10.value).toBe(1);
    const withoutEnd = combatFixture();
    withoutEnd.events = withoutEnd.events.filter((e) => e.type !== 'GAME_END');
    expect(player(withoutEnd).soloKills15.reason).toBe('missing_frame');
    expect(player(withoutEnd).kpByPhase[0].reason).toBe('missing_frame');
    expect(
      player(combatFixture([], { gameDuration: 599 })).soloKills10.reason,
    ).toBe('short_match');
  });
  it('keeps zero denominators unavailable, valid zero rewards, and missing rewards separate', () => {
    const input = combatFixture([
      killEvent({ payload: { killerId: 1, bounty: 0 } }),
    ]);
    expect(player(input).rewards.bountyReceived.value).toBe(0);
    expect(player(input).rewards.shutdownReceived.reason).toBe('missing_field');
    expect(player(input, 'b').kpTotal.reason).toBe('zero_denominator');
    expect(player(input).kpByPhase[1].reason).toBe('zero_denominator');
  });
  it('supports later processing generations while rejecting mixed and unsupported projection versions', () => {
    expect(
      player(
        combatFixture([killEvent({ processingVersion: 3 })], {
          processingVersion: 3,
        }),
      ).events.kills.value,
    ).toBe(1);
    expect(
      player(combatFixture([], { projectionComplete: false })).soloKills15
        .reason,
    ).toBe('missing_projection');
    expect(
      player(combatFixture([killEvent({ metricVersion: 2 })])).events.kills
        .reason,
    ).toBe('unsupported_version');
    expect(
      player(combatFixture([killEvent({ processingVersion: 3 })])).events.kills
        .reason,
    ).toBe('unsupported_version');
  });
  it('detects lost event rows by summary reconciliation and cannot invent zero totals', () => {
    const input = combatFixture();
    input.events = [];
    expect(player(input).events.kills.reason).toBe('incomplete_events');
    expect(player(input).soloKills15.reason).toBe('incomplete_events');
    expect(player(input).reconciliation.kills).toMatchObject({
      observedCount: 0,
      summaryCount: 1,
      difference: -1,
      complete: false,
    });
    expect(player(input).kpTotal.value).toBe(100);
  });
  it('does not place missing timestamps in an arbitrary phase and counts unknown event types', () => {
    const input = combatFixture([
      killEvent({ timestampMs: null }),
      killEvent({
        type: 'FUTURE_EVENT',
        eventIndex: 1,
        quality: { unknownType: true },
      }),
    ]);
    expect(player(input).soloKills15.reason).toBe('missing_field');
    expect(player(input).kpByPhase[0].reason).toBe('missing_field');
    expect(player(input).events.kills.value).toBe(1);
    expect(calculateCombat(input).quality.unknownEvents).toBe(1);
    expect(calculateSoloCheckpoints(input, 'outside').soloKills15.reason).toBe(
      'outside_cohort',
    );
  });
});
