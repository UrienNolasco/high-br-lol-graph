import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeTimelineEvents,
  KNOWN_EVENT_TYPES,
} from './normalized-events';
import { TimelineDto } from './dto/timeline.dto';
import { TimelineParserService } from './timeline-parser.service';
import { MatchDto } from './dto/match.dto';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
) as TimelineDto;
const summary = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
) as MatchDto;
const puuids = new Map(
  summary.info.participants.map((p) => [p.participantId, p.puuid]),
);
const teams = new Map(
  summary.info.participants.map((p) => [p.participantId, p.teamId]),
);
const synthetic = (events: object[], duplicateFrame = false): TimelineDto =>
  ({
    metadata: { matchId: 'SYNTHETIC', participants: ['a', 'b'] },
    info: {
      gameId: 1,
      frameInterval: 60000,
      frames: Array.from({ length: duplicateFrame ? 2 : 1 }, () => ({
        timestamp: 60000,
        participantFrames: {},
        events,
      })),
    },
  }) as TimelineDto;

describe('MET04 source event normalization', () => {
  it('preserves the supplied processing generation independently of metric version', () => {
    const raw = synthetic([{ type: 'FUTURE_EVENT', timestamp: 5 }]);
    const rows = normalizeTimelineEvents(raw, new Map(), new Map(), {
      processingVersion: 79,
    });
    expect(rows[0]).toMatchObject({ processingVersion: 79, metricVersion: 1 });
    const parsed = new TimelineParserService().parseTimeline(
      raw,
      new Map(),
      new Map(),
      79,
    );
    expect(parsed.normalizedEvents[0].processingVersion).toBe(79);
  });
  it('round-trips every payload of the real 41-frame/1966-event fixture with source identity', () => {
    const before = JSON.stringify(fixture);
    const rows = normalizeTimelineEvents(fixture, puuids, teams, {
      processingVersion: 4,
    });
    expect(fixture.info.frames).toHaveLength(41);
    expect(rows).toHaveLength(1966);
    expect(
      new Set(rows.map((e) => `${e.matchId}:${e.frameIndex}:${e.eventIndex}`))
        .size,
    ).toBe(1966);
    expect(new Set(rows.map((e) => e.type))).toEqual(KNOWN_EVENT_TYPES);
    for (const e of rows) {
      expect(e.payload).toEqual(
        fixture.info.frames[e.frameIndex].events[e.eventIndex],
      );
      expect(e.timestampMs).toBe(e.payload.timestamp);
      expect(e.quality.unknownType).toBe(false);
    }
    expect(JSON.stringify(fixture)).toBe(before);
    const wards = rows.filter((e) => e.type === 'WARD_PLACED');
    expect(wards).toHaveLength(752);
    expect(
      wards.every((w) => w.positionX === null && w.positionY === null),
    ).toBe(true);
    const kill = rows.find((e) => e.type === 'CHAMPION_KILL')!;
    expect(kill.payload.victimDamageReceived).toEqual(
      expect.arrayContaining([expect.objectContaining({ magicDamage: 0 })]),
    );
    expect(kill.payload.victimDamageReceived).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ magicalDamage: expect.anything() }),
      ]),
    );
  });
  it('preserves duplicate timestamps, duplicate frames and unknown event payloads', () => {
    const raw = synthetic(
      [
        {
          type: 'FUTURE_EVENT',
          timestamp: 5,
          nested: { zero: 0, unknown: ['x', null] },
        },
        { type: 'ITEM_PURCHASED', timestamp: 5, participantId: 1, itemId: 1 },
      ],
      true,
    );
    const result = normalizeTimelineEvents(
      raw,
      new Map([[1, 'a']]),
      new Map(),
      {
        processingVersion: 4,
      },
    );
    expect(result).toHaveLength(4);
    expect(result.map((e) => [e.frameIndex, e.eventIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(result[0]).toMatchObject({
      type: 'FUTURE_EVENT',
      timestampMs: 5,
      actorPuuid: null,
      beneficiaryTeamId: null,
      quality: { unknownType: true },
      payload: { nested: { zero: 0, unknown: ['x', null] } },
    });
  });
  it('keeps environmental killers and sentinel teams unassigned while crediting the building beneficiary', () => {
    const rows = normalizeTimelineEvents(
      synthetic([
        {
          type: 'BUILDING_KILL',
          timestamp: 1,
          teamId: 200,
          killerId: 0,
          laneType: 'TOP_LANE',
          towerType: 'OUTER_TURRET',
        },
        { type: 'BUILDING_KILL', timestamp: 2, teamId: 0, killerId: 0 },
        { type: 'OBJECTIVE_BOUNTY_FINISH', timestamp: 3, teamId: 0 },
        {
          type: 'ELITE_MONSTER_KILL',
          timestamp: 4,
          killerId: 0,
          killerTeamId: 200,
          monsterType: 'DRAGON',
        },
        {
          type: 'CHAMPION_KILL',
          timestamp: 5,
          killerId: 0,
          victimId: 1,
          assistingParticipantIds: [],
        },
      ]),
      new Map([
        [0, 'must-not-be-used'],
        [1, 'a'],
      ]),
      new Map(),
      { processingVersion: 4 },
    );
    expect(rows[0]).toMatchObject({
      actorParticipantId: null,
      actorPuuid: null,
      sourceTeamId: null,
      ownerTeamId: 200,
      beneficiaryTeamId: 100,
      lane: 'TOP_LANE',
      tier: 'OUTER_TURRET',
    });
    expect(rows[1]).toMatchObject({
      ownerTeamId: null,
      beneficiaryTeamId: null,
      quality: { sentinelFields: ['killerId', 'teamId'] },
    });
    expect(rows[2].beneficiaryTeamId).toBeNull();
    expect(rows[3]).toMatchObject({ actorPuuid: null, beneficiaryTeamId: 200 });
    expect(rows[4]).toMatchObject({
      actorPuuid: null,
      victimPuuid: 'a',
      assistingParticipantIds: [],
      assistingPuuids: [],
    });
  });
  it('distinguishes omitted assistants/recap from observed empty, retaining unresolved IDs and explicit context conflicts', () => {
    const rows = normalizeTimelineEvents(
      synthetic([
        { type: 'CHAMPION_KILL', timestamp: 1, killerId: 99, victimId: 2 },
        {
          type: 'ELITE_MONSTER_KILL',
          timestamp: 1,
          killerId: 1,
          killerTeamId: 200,
          assistingParticipantIds: [2, 98, 0],
        },
      ]),
      new Map([
        [1, 'a'],
        [2, 'b'],
      ]),
      new Map([
        [1, 100],
        [2, 200],
      ]),
      { processingVersion: 4 },
    );
    expect(rows[0]).toMatchObject({
      actorParticipantId: 99,
      actorPuuid: null,
      assistingParticipantIds: null,
      assistingPuuids: null,
      quality: { unresolvedParticipantIds: [99] },
    });
    expect(rows[0].payload).not.toHaveProperty('victimDamageReceived');
    expect(rows[1]).toMatchObject({
      assistingParticipantIds: [2, 98],
      assistingPuuids: ['b', null],
      beneficiaryTeamId: 200,
      sourceTeamId: 100,
      quality: {
        conflicts: ['killerTeamId_disagrees_with_actor'],
        unresolvedParticipantIds: [98],
      },
    });
  });
  it('preserves observed coordinate zero and reports missing/invalid coordinates without guessing from a frame', () => {
    const rows = normalizeTimelineEvents(
      synthetic([
        {
          type: 'WARD_PLACED',
          timestamp: 1,
          creatorId: 1,
          wardType: 'UNDEFINED',
        },
        {
          type: 'WARD_PLACED',
          timestamp: 2,
          creatorId: 1,
          position: { x: 0, y: 12 },
        },
        {
          type: 'WARD_KILL',
          timestamp: 3,
          killerId: 1,
          position: { x: 'x', y: 2 },
        },
      ]),
      new Map([[1, 'a']]),
      new Map([[1, 100]]),
      { processingVersion: 4 },
    );
    expect(rows[0]).toMatchObject({
      positionX: null,
      positionY: null,
      ownerTeamId: 100,
    });
    expect(rows[1]).toMatchObject({ positionX: 0, positionY: 12 });
    expect(rows[2]).toMatchObject({
      positionX: null,
      positionY: 2,
      quality: { invalidFields: ['position.x'] },
    });
  });
  it('preserves a kill without coordinates/recap while omitting only its heatmap point', () => {
    const parsed = new TimelineParserService().parseTimeline(
      synthetic([
        { type: 'CHAMPION_KILL', timestamp: 1, killerId: 1, victimId: 2 },
      ]),
      new Map([
        [1, 'a'],
        [2, 'b'],
      ]),
      new Map(),
      4,
    );
    expect(parsed.normalizedEvents).toHaveLength(1);
    expect(parsed.normalizedEvents[0]).toMatchObject({
      positionX: null,
      positionY: null,
      actorPuuid: 'a',
      victimPuuid: 'b',
    });
    expect(parsed.participants.get('a')?.killPositions).toEqual([]);
    expect(parsed.participants.get('b')?.deathPositions).toEqual([]);
  });

  it('integrates parser output and corrects legacy ward coordinates/objective attribution', () => {
    const parsed = new TimelineParserService().parseTimeline(
      fixture,
      puuids,
      teams,
      4,
    );
    expect(parsed.normalizedEvents).toHaveLength(1966);
    expect(
      [...parsed.participants.values()]
        .flatMap((p) => p.wardPositions)
        .every((w) => w.x === null && w.y === null),
    ).toBe(true);
    expect(
      parsed.objectivesTimeline.filter(
        (e) => e.type === 'TOWER' || e.type === 'INHIBITOR',
      ),
    ).toHaveLength(15);
    for (const objective of parsed.objectivesTimeline.filter(
      (e) => e.ownerTeamId,
    ))
      expect(objective.teamId).not.toBe(objective.ownerTeamId);
  });
});
