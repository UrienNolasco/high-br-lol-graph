export class PlayerProfileDto {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId?: number;
  summonerLevel?: number;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  rankedWins?: number;
  rankedLosses?: number;
  lastUpdated: Date;
  createdAt: Date;
}
