import { ChampionStatsDto } from '../dto/champion-stats.dto';

export function sortChampions(
  champions: ChampionStatsDto[],
  sortBy: string,
  order: 'asc' | 'desc',
): ChampionStatsDto[] {
  return [...champions].sort((a, b) => {
    const aValue = a[sortBy as keyof ChampionStatsDto];
    const bValue = b[sortBy as keyof ChampionStatsDto];

    if (aValue === undefined || bValue === undefined) return 0;
    if (aValue === bValue) return 0;

    if (order === 'desc') {
      return (aValue ?? 0) > (bValue ?? 0) ? -1 : 1;
    }
    return (aValue ?? 0) < (bValue ?? 0) ? -1 : 1;
  });
}
