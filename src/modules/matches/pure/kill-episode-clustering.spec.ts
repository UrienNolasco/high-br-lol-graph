import {
  LocatedKill,
  EPISODE_SENSITIVITY_PROFILES,
  clusterKills,
  pairQuickTrades,
  coClusterPairs,
  symmetricDifferenceSize,
} from './kill-episode-clustering';
const config = EPISODE_SENSITIVITY_PROFILES[1];
const kill = (
  id: number,
  time = 100000,
  x = 0,
  reverse = false,
): LocatedKill => ({
  eventId: `m:1:${id}`,
  timestampMs: time,
  frameIndex: 1,
  eventIndex: id,
  x,
  y: 0,
  actorPuuid: reverse ? 'b' : 'a',
  victimPuuid: reverse ? 'a' : 'b',
  actorTeamId: reverse ? 200 : 100,
  victimTeamId: reverse ? 100 : 200,
  assistingPuuids: [],
});
describe('versioned kill grouping and disjoint quick trades', () => {
  it('keeps simultaneous distant kills separate, assigns close kills once and is invariant to input ordering', () => {
    const events = [
      kill(0),
      kill(1, 100000, 5000),
      kill(2, 100000, 1000),
      kill(3, 105000, 4900),
    ];
    const a = clusterKills(events, config),
      b = clusterKills([...events].reverse(), config);
    expect(a).toEqual(b);
    expect(a.map((c) => c.kills.map((k) => k.eventId))).toEqual([
      ['m:1:0', 'm:1:2'],
      ['m:1:1', 'm:1:3'],
    ]);
    expect(new Set(a.flatMap((c) => c.kills.map((k) => k.eventId))).size).toBe(
      events.length,
    );
  });
  it('enforces complete spatial diameter and total duration instead of unbounded chains', () => {
    expect(
      clusterKills(
        [kill(0, 100000, 0), kill(1, 105000, 1500), kill(2, 110000, 3000)],
        config,
      ).map((c) => c.kills.length),
    ).toEqual([2, 1]);
    expect(
      clusterKills(
        [0, 15000, 30000, 45000].map((t, i) => kill(i, t)),
        config,
      ).map((c) => c.kills.length),
    ).toEqual([3, 1]);
    expect(clusterKills([kill(0), kill(1, 115000, 2000)], config)).toHaveLength(
      1,
    );
    expect(clusterKills([kill(0), kill(1, 115001, 2000)], config)).toHaveLength(
      2,
    );
  });
  it('pairs strictly later reciprocal team kills within inclusive10s/distance limits, never reusing either event', () => {
    const events = [
      kill(0),
      kill(1, 110000, 2000, true),
      kill(2, 111000, 1000),
      kill(3, 115000, 2000, true),
    ];
    const pairs = pairQuickTrades(events, config);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({
      deathEventId: 'm:1:0',
      responseEventId: 'm:1:1',
      latencyMs: 10000,
      distanceUnits: 2000,
      killedOriginalAuthor: true,
    });
    expect(
      new Set(pairs.flatMap((p) => [p.deathEventId, p.responseEventId])).size,
    ).toBe(4);
    expect(
      pairQuickTrades([kill(0), kill(1, 100000, 0, true)], config),
    ).toEqual([]);
    expect(
      pairQuickTrades([kill(0), kill(1, 110001, 0, true)], config),
    ).toEqual([]);
    expect(
      pairQuickTrades([kill(0), kill(1, 101000, 2001, true)], config),
    ).toEqual([]);
  });
  it('selects most recent eligible unmatched death then distance/source identity and excludes unknown teams', () => {
    expect(
      pairQuickTrades(
        [kill(0), kill(1, 105000, 100), kill(2, 106000, 0, true)],
        config,
      )[0].deathEventId,
    ).toBe('m:1:1');
    expect(
      pairQuickTrades(
        [kill(0), { ...kill(1, 101000, 0, true), actorTeamId: null }],
        config,
      ),
    ).toEqual([]);
    expect(
      pairQuickTrades(
        [kill(0, 100000, 1000), kill(1, 100000, 100), kill(2, 101000, 0, true)],
        config,
      )[0].deathEventId,
    ).toBe('m:1:1');
  });
  it('publishes meaningful sensitivity and rejects duplicated identities/invalid thresholds', () => {
    const events = [kill(0), kill(1, 110000, 1600, true)];
    const profiles = EPISODE_SENSITIVITY_PROFILES.map((c) =>
      clusterKills(events, c),
    );
    expect(profiles.map((p) => p.length)).toEqual([2, 1, 1]);
    expect(
      symmetricDifferenceSize(
        coClusterPairs(profiles[0]),
        coClusterPairs(profiles[1]),
      ),
    ).toBe(1);
    expect(() => clusterKills([events[0], events[0]], config)).toThrow(
      'Duplicate',
    );
    expect(() => pairQuickTrades([events[0], events[0]], config)).toThrow(
      'Duplicate',
    );
    expect(() => clusterKills(events, { ...config, gapMs: -1 })).toThrow(
      RangeError,
    );
  });
});
