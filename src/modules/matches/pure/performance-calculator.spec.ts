import {
  computePlayerMetrics,
  findLaneOpponent,
  computeComparison,
  MatchParticipant,
} from './performance-calculator';

describe('performance-calculator', () => {
  const basePlayer: MatchParticipant = {
    puuid: 'player',
    championId: 157,
    championName: 'Yasuo',
    role: 'MID',
    teamId: 100,
    totalDamage: 30000,
    goldEarned: 15000,
    csGraph: [10, 20, 30, 40, 50],
    totalCs: 300,
    visionScore: 30,
    damageTaken: 25000,
    kda: 3.5,
    match: { gameDuration: 1800 },
  };

  describe('computePlayerMetrics', () => {
    it('should compute per-minute metrics', () => {
      const result = computePlayerMetrics(basePlayer, 30);

      expect(result.dpm).toBe(1000);
      expect(result.gpm).toBe(500);
      expect(result.cspm).toBe(10);
      expect(result.visionScorePerMin).toBe(1);
      expect(result.damageTakenPerMin).toBeCloseTo(833.333333333);
    });

    it('should handle empty csGraph', () => {
      const player = { ...basePlayer, csGraph: [] };

      const result = computePlayerMetrics(player, 30);

      expect(result.cspm).toBe(10);
    });
  });

  it('does not fabricate final CS from timeline or divide by zero duration', () => {
    expect(
      computePlayerMetrics({ ...basePlayer, totalCs: undefined }, 30),
    ).toMatchObject({
      cspm: null,
      reasons: { cspm: 'missing_or_invalid_field' },
    });
    expect(computePlayerMetrics(basePlayer, 0)).toMatchObject({
      cspm: null,
      dpm: null,
      reasons: { cspm: 'zero_denominator' },
    });
  });
  it('normalizes roles and rejects ambiguous opponents', () => {
    const enemy = {
      ...basePlayer,
      role: 'MIDDLE',
      teamId: 200,
      puuid: 'enemy',
    };
    expect(findLaneOpponent([basePlayer, enemy], basePlayer)).toBe(enemy);
    expect(
      findLaneOpponent(
        [basePlayer, enemy, { ...enemy, puuid: 'other' }],
        basePlayer,
      ),
    ).toBeUndefined();
  });
  describe('findLaneOpponent', () => {
    it('should find opponent in same role on opposite team', () => {
      const participants: MatchParticipant[] = [
        basePlayer,
        {
          ...basePlayer,
          puuid: 'enemy',
          teamId: 200,
        },
        {
          ...basePlayer,
          puuid: 'teammate',
          teamId: 100,
          role: 'TOP',
        },
      ];

      const opponent = findLaneOpponent(participants, basePlayer);

      expect(opponent?.puuid).toBe('enemy');
    });

    it('should return undefined when no opponent found', () => {
      const participants: MatchParticipant[] = [basePlayer];

      expect(findLaneOpponent(participants, basePlayer)).toBeUndefined();
    });
  });

  describe('computeComparison', () => {
    it('should compute advantage percentages', () => {
      const player = {
        championId: 1,
        championName: 'P',
        role: 'MID',
        dpm: 1000,
        gpm: 500,
        cspm: 8,
        visionScorePerMin: 1.5,
        damageTakenPerMin: 500,
        kda: 3,
      };
      const opponent = {
        puuid: 'e',
        championId: 2,
        championName: 'O',
        role: 'MID',
        dpm: 800,
        gpm: 400,
        cspm: 7,
        visionScorePerMin: 1.0,
        damageTakenPerMin: 600,
        kda: 2,
      };

      const result = computeComparison(player, opponent);

      expect(result.dpmAdvantage).toBe(200);
      expect(result.dpmAdvantagePercent).toBe(25);
      expect(result.gpmAdvantage).toBe(100);
      expect(result.gpmAdvantagePercent).toBe(25);
      expect(result.cspmAdvantage).toBe(1);
      expect(result.visionAdvantage).toBe(0.5);
      expect(result.survivability).toBeNull();
      expect(result.survivabilityReason).toBe('not_a_survivability_measure');
      expect(result.damageTakenPerMinDifference).toBe(-100);
    });

    it('should handle zero division', () => {
      const player = {
        championId: 1,
        championName: 'P',
        role: 'MID',
        dpm: 100,
        gpm: 100,
        cspm: 1,
        visionScorePerMin: 0.5,
        damageTakenPerMin: 100,
        kda: 1,
      };
      const opponent = {
        puuid: 'e',
        championId: 2,
        championName: 'O',
        role: 'MID',
        dpm: 0,
        gpm: 0,
        cspm: 0,
        visionScorePerMin: 0,
        damageTakenPerMin: 0,
        kda: 0,
      };

      const result = computeComparison(player, opponent);

      expect(result.dpmAdvantagePercent).toBeNull();
      expect(result.gpmAdvantagePercent).toBeNull();
      expect(result.cspmAdvantagePercent).toBeNull();
    });
  });
});
