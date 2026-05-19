import { HeatmapEntryDto } from '../dto/player-activity.dto';

export function buildEmptyHeatmap(): HeatmapEntryDto[] {
  const heatmap: HeatmapEntryDto[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({
        dayOfWeek: day,
        hour,
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      });
    }
  }
  return heatmap;
}

export function fillHeatmap(
  raw: Array<{
    dayofweek: number;
    hour: number;
    games: bigint;
    wins: bigint;
    losses: bigint;
    winrate: number;
  }>,
  heatmap: HeatmapEntryDto[],
): HeatmapEntryDto[] {
  raw.forEach((entry) => {
    const index = Number(entry.dayofweek) * 24 + Number(entry.hour);
    heatmap[index] = {
      dayOfWeek: Number(entry.dayofweek),
      hour: Number(entry.hour),
      games: Number(entry.games),
      wins: Number(entry.wins),
      losses: Number(entry.losses),
      winRate: entry.winrate,
    };
  });
  return heatmap;
}
