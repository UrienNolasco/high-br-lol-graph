import { buildEmptyHeatmap, fillHeatmap } from './heatmap.builder';

describe('heatmap.builder', () => {
  describe('buildEmptyHeatmap', () => {
    it('should create a 7x24 matrix of zeroed entries', () => {
      const result = buildEmptyHeatmap();
      expect(result).toHaveLength(168);
      expect(result[0]).toEqual({
        dayOfWeek: 0,
        hour: 0,
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      });
      expect(result[167]).toEqual({
        dayOfWeek: 6,
        hour: 23,
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      });
    });

    it('should cover all 7 days and 24 hours', () => {
      const result = buildEmptyHeatmap();
      const days = new Set(result.map((e) => e.dayOfWeek));
      const hours = new Set(result.map((e) => e.hour));
      expect(days.size).toBe(7);
      expect(hours.size).toBe(24);
    });
  });

  describe('fillHeatmap', () => {
    it('should fill heatmap with raw data', () => {
      const empty = buildEmptyHeatmap();
      const raw = [
        {
          dayofweek: 1,
          hour: 14,
          games: BigInt(10),
          wins: BigInt(7),
          losses: BigInt(3),
          winrate: 70,
        },
      ];

      const result = fillHeatmap(raw, [...empty]);
      const index = 1 * 24 + 14;
      expect(result[index]).toEqual({
        dayOfWeek: 1,
        hour: 14,
        games: 10,
        wins: 7,
        losses: 3,
        winRate: 70,
      });
    });

    it('should not mutate entries not in raw data', () => {
      const empty = buildEmptyHeatmap();
      const raw = [
        {
          dayofweek: 0,
          hour: 0,
          games: BigInt(1),
          wins: BigInt(1),
          losses: BigInt(0),
          winrate: 100,
        },
      ];

      const result = fillHeatmap(raw, [...empty]);
      expect(result[1]).toEqual({
        dayOfWeek: 0,
        hour: 1,
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      });
    });

    it('should handle multiple entries', () => {
      const empty = buildEmptyHeatmap();
      const raw = [
        {
          dayofweek: 0,
          hour: 0,
          games: BigInt(5),
          wins: BigInt(3),
          losses: BigInt(2),
          winrate: 60,
        },
        {
          dayofweek: 6,
          hour: 23,
          games: BigInt(2),
          wins: BigInt(1),
          losses: BigInt(1),
          winrate: 50,
        },
      ];

      const result = fillHeatmap(raw, [...empty]);
      expect(result[0].games).toBe(5);
      expect(result[167].games).toBe(2);
    });
  });
});
