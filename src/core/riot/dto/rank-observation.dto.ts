/** Rank returned by Riot for an account discovery observation. */
export interface RiotRankObservation {
  tier: string;
  division: string | null;
  leaguePoints: number | null;
  queue: string;
  observedAt: Date;
}
