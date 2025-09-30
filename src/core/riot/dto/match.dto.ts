export class ParticipantDto {
  championName: string;
  puuid: string;
  teamId: number;
  win: boolean;
}

export class InfoDto {
  gameVersion: string;
  participants: ParticipantDto[];
}

export class MatchDto {
  info: InfoDto;
  metadata: {
    matchId: string;
  };
}
