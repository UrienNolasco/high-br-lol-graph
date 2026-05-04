import { ApiProperty } from '@nestjs/swagger';

export class RoleStatsDto {
  @ApiProperty()
  role: string;

  @ApiProperty()
  gamesPlayed: number;

  @ApiProperty()
  percentage: number;

  @ApiProperty()
  wins: number;

  @ApiProperty()
  losses: number;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  avgKda: number;
}

export class PlayerRoleDistributionDto {
  @ApiProperty()
  puuid: string;

  @ApiProperty()
  patch: string;

  @ApiProperty({ type: [RoleStatsDto] })
  roles: RoleStatsDto[];

  @ApiProperty()
  totalGames: number;
}
