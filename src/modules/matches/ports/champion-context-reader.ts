export interface ChampionContextFilters {
  patch: string;
  queueId: number;
  fromMs?: number;
  toMs?: number;
  limit: number;
}
export interface ChampionContextMatch {
  matchId: string;
  populationEligible: boolean | null;
  participants: {
    puuid: string;
    championId: number;
    role: string;
    teamId: number;
    win: boolean;
  }[];
}
export interface ChampionContextCohort {
  matches: ChampionContextMatch[];
  availableMatches: number;
  truncated: boolean;
}
export interface ChampionContextReader {
  read(filters: ChampionContextFilters): Promise<ChampionContextCohort>;
}
export const CHAMPION_CONTEXT_READER = Symbol('CHAMPION_CONTEXT_READER');
