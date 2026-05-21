import { calculateAverageTimeline } from './timeline-calculator';

describe('timeline-calculator', () => {
  describe('calculateAverageTimeline', () => {
    it('should average cs values across matches', () => {
      const matches = [
        { csGraph: [10, 20, 30], goldGraph: [500, 600, 700] },
        { csGraph: [20, 30, 40], goldGraph: [600, 700, 800] },
      ];

      const result = calculateAverageTimeline(matches, 'csGraph');

      expect(result).toEqual([
        { minute: 0, value: 15 },
        { minute: 1, value: 25 },
        { minute: 2, value: 35 },
      ]);
    });

    it('should average gold values across matches', () => {
      const matches = [
        { csGraph: [10], goldGraph: [500, 600] },
        { csGraph: [20], goldGraph: [700, 800] },
      ];

      const result = calculateAverageTimeline(matches, 'goldGraph');

      expect(result).toEqual([
        { minute: 0, value: 600 },
        { minute: 1, value: 700 },
      ]);
    });

    it('should handle uneven match lengths', () => {
      const matches = [
        { csGraph: [10, 20, 30, 40], goldGraph: [] },
        { csGraph: [5, 10], goldGraph: [] },
      ];

      const result = calculateAverageTimeline(matches, 'csGraph');

      expect(result).toHaveLength(4);
      expect(result[2].value).toBe(30);
      expect(result[3].value).toBe(40);
    });

    it('should return empty for no matches', () => {
      expect(calculateAverageTimeline([], 'csGraph')).toEqual([]);
    });
  });
});
