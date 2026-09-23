import {
  computeGoldTimeline,
  determineWinner,
  findMaxAdvantage,
  findObservedSwing,
  findThrowPoint,
  GoldParticipant,
} from './gold-calculator';

const roster = (
  blue: (number | null)[],
  red: (number | null)[],
): GoldParticipant[] =>
  [100, 200].flatMap((teamId) =>
    Array.from({ length: 5 }, () => ({
      teamId,
      goldGraph: [...(teamId === 100 ? blue : red)],
    })),
  );
const point = (minute: number, difference: number | null) => ({
  minute,
  difference,
  blueTeam: null,
  redTeam: null,
});

describe('gold-calculator', () => {
  it('sums complete rosters and preserves observed zero', () => {
    const result = computeGoldTimeline(roster([0, 1200], [0, 1000]));
    expect(result[0]).toMatchObject({
      blueTeam: 0,
      redTeam: 0,
      difference: 0,
      reason: null,
    });
    expect(result[1]).toMatchObject({
      blueTeam: 6000,
      redTeam: 5000,
      difference: 1000,
    });
    expect(result[1].coverage.blueTeam).toMatchObject({
      validSamples: 5,
      totalSamples: 5,
      coverage: 1,
    });
  });

  it('returns empty series safely', () => {
    expect(computeGoldTimeline([])).toEqual([]);
    expect(computeGoldTimeline(roster([], []))).toEqual([]);
    expect(findMaxAdvantage([])).toBeNull();
    expect(findObservedSwing([])).toBeNull();
  });

  it('never turns a missing player, frame or invalid value into zero', () => {
    const players = roster([500, 800], [500, 1000, 1500]);
    players[0].goldGraph[1] = null;
    const result = computeGoldTimeline(players);
    expect(result[1]).toMatchObject({
      blueTeam: null,
      redTeam: 5000,
      difference: null,
      reason: 'missing_frame',
    });
    expect(result[1].coverage.blueTeam.coverage).toBe(0.8);
    expect(result[2]).toMatchObject({
      blueTeam: null,
      redTeam: 7500,
      difference: null,
    });
    expect(computeGoldTimeline(players.slice(1))[0].blueTeam).toBeNull();
    for (const invalid of [NaN, Infinity, -1]) {
      players[0].goldGraph[0] = invalid;
      expect(computeGoldTimeline(players)[0]).toMatchObject({
        blueTeam: null,
        reason: 'invalid_value',
      });
    }
  });

  it('does not assign unknown teams or extra participants to a valid total', () => {
    const players = roster([500], [500]);
    expect(
      computeGoldTimeline([...players, { teamId: 0, goldGraph: [999999] }])[0]
        .difference,
    ).toBe(0);
    expect(
      computeGoldTimeline([...players, players[0]])[0].blueTeam,
    ).toBeNull();
  });

  it('uses exactly one winner in a valid summary, never gold', () => {
    expect(
      determineWinner([
        { teamId: 100, win: true },
        { teamId: 200, win: false },
      ]),
    ).toBe('blueTeam');
    expect(
      determineWinner([
        { teamId: 100, win: false },
        { teamId: 200, win: true },
      ]),
    ).toBe('redTeam');
    for (const teams of [
      [],
      [{ teamId: 100, win: true }],
      [
        { teamId: 100, win: false },
        { teamId: 200, win: false },
      ],
      [
        { teamId: 100, win: true },
        { teamId: 200, win: true },
      ],
      [
        { teamId: 0, win: true },
        { teamId: 200, win: false },
      ],
    ]) {
      expect(determineWinner(teams)).toBeNull();
    }
  });

  it('uses valid samples only, chooses earliest equal magnitude and never assigns tied gold to red', () => {
    expect(
      findMaxAdvantage([point(0, null), point(1, -500), point(2, 500)]),
    ).toEqual({ minute: 1, team: 'redTeam', difference: 500 });
    expect(findMaxAdvantage([point(0, 0), point(1, 0)])).toEqual({
      minute: 0,
      team: null,
      difference: 0,
    });
    expect(findMaxAdvantage([point(0, null)])).toBeNull();
  });

  it('uses a strict threshold, records source indices and returns the first observed swing', () => {
    const points = [point(5, 0), point(6, 3000), point(7, -1), point(8, 10000)];
    expect(findObservedSwing(points)).toEqual({
      minute: 7,
      beforeMinute: 6,
      beforeDifference: 3000,
      afterDifference: -1,
      swing: 3001,
    });
    expect(findThrowPoint(points)).toEqual(findObservedSwing(points));
  });

  it('does not interpolate gaps or compare nonadjacent observations', () => {
    expect(
      findObservedSwing([point(0, 5000), point(1, null), point(2, -5000)]),
    ).toBeNull();
    expect(findObservedSwing([point(0, 5000), point(2, -5000)])).toBeNull();
    expect(findObservedSwing([point(0, 0), point(1, 3000)])).toBeNull();
  });
});
