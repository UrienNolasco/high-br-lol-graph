import { sortChampions } from './champion.sorter';
import { ChampionStatsDto } from '../dto/champion-stats.dto';

describe('champion.sorter', () => {
  function makeChampion(name: string, winRate: number, gamesPlayed: number): ChampionStatsDto {
    return {
      championId: 1, championName: name, winRate, gamesPlayed,
      wins: 0, losses: 0, images: null, kda: 0, dpm: 0, cspm: 0, gpm: 0,
      banRate: 0, pickRate: 0, tier: 'S', rank: null,
    };
  }

  it('should sort by winRate descending by default', () => {
    const champions = [makeChampion('A', 50, 100), makeChampion('B', 60, 100), makeChampion('C', 55, 100)];
    const result = sortChampions(champions, 'winRate', 'desc');
    expect(result[0].championName).toBe('B');
    expect(result[1].championName).toBe('C');
    expect(result[2].championName).toBe('A');
  });

  it('should sort by winRate ascending', () => {
    const champions = [makeChampion('A', 60, 100), makeChampion('B', 50, 100)];
    const result = sortChampions(champions, 'winRate', 'asc');
    expect(result[0].winRate).toBe(50);
    expect(result[1].winRate).toBe(60);
  });

  it('should sort by gamesPlayed', () => {
    const champions = [makeChampion('A', 50, 50), makeChampion('B', 60, 200)];
    const result = sortChampions(champions, 'gamesPlayed', 'desc');
    expect(result[0].gamesPlayed).toBe(200);
    expect(result[1].gamesPlayed).toBe(50);
  });

  it('should return unchanged order when values are equal', () => {
    const champions = [makeChampion('A', 50, 100), makeChampion('B', 50, 100)];
    const result = sortChampions(champions, 'winRate', 'desc');
    expect(result[0].championName).toBe('A');
  });

  it('should handle undefined values gracefully', () => {
    const champions = [makeChampion('A', 50, 100), makeChampion('B', 50, 100)];
    (champions[0] as any).winRate = undefined;
    const result = sortChampions(champions, 'winRate', 'desc');
    expect(result).toHaveLength(2);
  });
});
