import { ChampionStatsDto } from '../dto/champion-stats.dto';

export function sortChampions(
  champions: ChampionStatsDto[],
  sortBy: string,
  order: 'asc' | 'desc',
): ChampionStatsDto[] {
  return [...champions].sort((a, b) => {
    const aValue = a[sortBy as keyof ChampionStatsDto];
    const bValue = b[sortBy as keyof ChampionStatsDto];

    if (aValue == null && bValue == null) return a.championId - b.championId;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    if (aValue === bValue) return a.championId - b.championId;

    if (order === 'desc') {
      return (aValue ?? 0) > (bValue ?? 0) ? -1 : 1;
    }
    return (aValue ?? 0) < (bValue ?? 0) ? -1 : 1;
  });
}
