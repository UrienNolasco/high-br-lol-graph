import { ApiProperty } from '@nestjs/swagger';

export class PlayerChampionDetailDto {
  @ApiProperty()
  championId: number;

  @ApiProperty()
  championName: string;

  @ApiProperty()
  gamesPlayed: number;

  @ApiProperty()
  wins: number;

  @ApiProperty()
  losses: number;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  avgKda: number;

  @ApiProperty()
  avgCspm: number;

  @ApiProperty()
  avgDpm: number;

  @ApiProperty()
  avgGpm: number;

  @ApiProperty()
  avgVisionScore: number;

  @ApiProperty()
  avgCsd15: number;

  @ApiProperty()
  avgGd15: number;

  @ApiProperty()
  avgXpd15: number;

  @ApiProperty()
  roleDistribution: Record<string, number>;

  @ApiProperty({ nullable: true })
  lastPlayedAt: Date | null;
}

export class PlayerChampionsDto {
  @ApiProperty()
  puuid: string;

  @ApiProperty()
  patch: string;

  @ApiProperty({ type: [PlayerChampionDetailDto] })
  champions: PlayerChampionDetailDto[];
}
