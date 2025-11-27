import { ApiProperty } from '@nestjs/swagger';
import { ChampionImagesDto } from './champion-images.dto';

export class MatchupChampionDto {
  @ApiProperty({ example: 'Irelia' })
  name: string;

  @ApiProperty({ type: ChampionImagesDto })
  images: ChampionImagesDto;

  @ApiProperty({ example: 25 })
  winRate: number;

  @ApiProperty({ example: 50 })
  wins: number;
}

export class MatchupStatsDto {
  @ApiProperty({ type: MatchupChampionDto })
  championA: MatchupChampionDto;

  @ApiProperty({ type: MatchupChampionDto })
  championB: MatchupChampionDto;

  @ApiProperty({ example: 200 })
  gamesPlayed: number;

  @ApiProperty({ example: '15.23' })
  patch: string;

  @ApiProperty({ example: 'TOP' })
  role: string;
}
