import { HeatmapEntryDto } from '../dto/player-activity.dto';

export interface ActivityInsights {
  mostActiveDay: string;
  mostActiveDayGames: number;
  mostActiveHour: number;
  mostActiveHourGames: number;
  peakWinRate: number;
  peakWinRateTime: string;
  worstWinRate: number;
  worstWinRateTime: string;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function calculateActivityInsights(
  heatmap: HeatmapEntryDto[],
): ActivityInsights {
  const dayStats = new Array(7).fill(0).map(() => ({ games: 0, wins: 0 }));
  heatmap.forEach((entry) => {
    dayStats[entry.dayOfWeek].games += entry.games;
    dayStats[entry.dayOfWeek].wins += entry.wins;
  });

  const mostActiveDayIndex = dayStats.reduce(
    (maxIdx, day, idx, arr) => (day.games > arr[maxIdx].games ? idx : maxIdx),
    0,
  );

  const mostActiveHourEntry = heatmap.reduce((max, entry) =>
    entry.games > max.games ? entry : max,
  );

  const qualifiedEntries = heatmap.filter((e) => e.games >= 5);
  const peakWinRateEntry =
    qualifiedEntries.length > 0
      ? qualifiedEntries.reduce((max, entry) =>
          entry.winRate > max.winRate ? entry : max,
        )
      : null;
  const worstWinRateEntry =
    qualifiedEntries.length > 0
      ? qualifiedEntries.reduce((min, entry) =>
          entry.winRate < min.winRate ? entry : min,
        )
      : null;

  return {
    mostActiveDay: DAY_NAMES[mostActiveDayIndex],
    mostActiveDayGames: dayStats[mostActiveDayIndex].games,
    mostActiveHour: mostActiveHourEntry.hour,
    mostActiveHourGames: mostActiveHourEntry.games,
    peakWinRate: peakWinRateEntry?.winRate || 0,
    peakWinRateTime: peakWinRateEntry
      ? `${DAY_NAMES[peakWinRateEntry.dayOfWeek]} ${peakWinRateEntry.hour}h`
      : 'N/A',
    worstWinRate: worstWinRateEntry?.winRate || 0,
    worstWinRateTime: worstWinRateEntry
      ? `${DAY_NAMES[worstWinRateEntry.dayOfWeek]} ${worstWinRateEntry.hour}h`
      : 'N/A',
  };
}
