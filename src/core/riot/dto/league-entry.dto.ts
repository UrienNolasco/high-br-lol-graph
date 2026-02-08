export class LeagueEntryDto {
  puuid: string;
  summonerId: string;
  queueType: string; // "RANKED_SOLO_5x5", "RANKED_FLEX_SR"
  tier: string; // "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}
