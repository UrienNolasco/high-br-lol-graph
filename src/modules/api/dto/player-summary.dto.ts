import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TopChampionDto {
  @ApiProperty()
  championId: number;

  @ApiProperty()
  championName: string;

  @ApiProperty()
  games: number;

  @ApiProperty()
  winRate: number;
}

export class PlayerSummaryDto {
  @ApiProperty()
  puuid: string;

  @ApiProperty()
  patch: string;

  @ApiProperty()
  queueId: number;

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
  roleDistribution: Record<string, number>;

  @ApiProperty({ type: [TopChampionDto] })
  topChampions: TopChampionDto[];

  @ApiProperty()
  lastUpdated: Date;
}
