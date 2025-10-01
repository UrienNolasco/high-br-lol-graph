export interface ParticipantDto {
  championName: string;
  championId: number;
  puuid: string;
  teamId: number;
  individualPosition: string;
  win: boolean;
}

export interface InfoDto {
  gameVersion: string;
  participants: ParticipantDto[];
}

export interface MatchDto {
  info: InfoDto;
  metadata: {
    matchId: string;
  };
}

export interface ChampionData {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
}

export interface ChampionsData {
  type: string;
  format: string;
  version: string;
  data: Record<string, ChampionData>;
}
