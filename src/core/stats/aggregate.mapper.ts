import {
  ChampionStats,
  PlayerStats,
  PlayerChampionStats,
} from '@prisma/client';
const average = (sum: number, count: number) =>
  count ? Number((sum / count).toFixed(2)) : 0;
export function championAverages(row: ChampionStats) {
  return {
    ...row,
    winRate: average(row.wins * 100, row.gamesPlayed),
    kda: average(row.sumKda, row.gamesPlayed),
    dpm: average(row.sumDpm, row.gamesPlayed),
    cspm: average(row.sumCspm, row.gamesPlayed),
    gpm: average(row.sumGpm, row.gamesPlayed),
  };
}
export function playerAverages<T extends PlayerStats | PlayerChampionStats>(
  row: T,
) {
  return {
    ...row,
    winRate: average(row.wins * 100, row.gamesPlayed),
    avgKda: average(row.sumKda, row.gamesPlayed),
    avgDpm: average(row.sumDpm, row.gamesPlayed),
    avgCspm: average(row.sumCspm, row.gamesPlayed),
    avgGpm: average(row.sumGpm, row.gamesPlayed),
    avgVisionScore: average(row.sumVisionScore, row.gamesPlayed),
  };
}
export function playerChampionAverages(row: PlayerChampionStats) {
  return {
    ...playerAverages(row),
    avgCsd15: row.laningSamples
      ? average(row.sumCsd15, row.laningSamples)
      : null,
    avgGd15: row.laningSamples ? average(row.sumGd15, row.laningSamples) : null,
    avgXpd15: row.laningSamples
      ? average(row.sumXpd15, row.laningSamples)
      : null,
  };
}
