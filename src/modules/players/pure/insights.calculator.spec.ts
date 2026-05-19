import { calculateActivityInsights } from './insights.calculator';
import { aHeatmapEntry } from '../__fixtures__/player.fixture';

describe('insights.calculator', () => {
  it('should find the most active day', () => {
    const heatmap = [
      aHeatmapEntry(0, 10, { games: 5 }),
      aHeatmapEntry(3, 15, { games: 50 }),
      aHeatmapEntry(6, 20, { games: 3 }),
    ];

    const result = calculateActivityInsights(heatmap as any);
    expect(result.mostActiveDay).toBe('Wednesday');
    expect(result.mostActiveDayGames).toBe(50);
  });

  it('should find the most active hour', () => {
    const heatmap = [
      aHeatmapEntry(1, 8, { games: 10 }),
      aHeatmapEntry(1, 14, { games: 100 }),
      aHeatmapEntry(1, 20, { games: 5 }),
    ];

    const result = calculateActivityInsights(heatmap as any);
    expect(result.mostActiveHour).toBe(14);
    expect(result.mostActiveHourGames).toBe(100);
  });

  it('should find peak win rate among entries with 5+ games', () => {
    const heatmap = [
      aHeatmapEntry(2, 10, { games: 10, winRate: 80 }),
      aHeatmapEntry(2, 11, { games: 3, winRate: 100 }),
      aHeatmapEntry(2, 12, { games: 6, winRate: 40 }),
    ];

    const result = calculateActivityInsights(heatmap as any);
    expect(result.peakWinRate).toBe(80);
    expect(result.peakWinRateTime).toContain('10h');
  });

  it('should return 0 for peak when no entry has 5+ games', () => {
    const heatmap = [aHeatmapEntry(0, 0, { games: 2, winRate: 100 })];

    const result = calculateActivityInsights(heatmap as any);
    expect(result.peakWinRate).toBe(0);
    expect(result.peakWinRateTime).toBe('N/A');
  });

  it('should return day names correctly', () => {
    const heatmap = [aHeatmapEntry(6, 15, { games: 30 })];

    const result = calculateActivityInsights(heatmap as any);
    expect(result.mostActiveDay).toBe('Saturday');
  });
});
