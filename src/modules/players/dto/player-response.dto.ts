import { ApiProperty } from '@nestjs/swagger';

export class PlayerResponseDto {
  @ApiProperty({ example: 'BhDoHm...' })
  puuid: string;

  @ApiProperty({ example: 'UrienMano' })
  gameName: string;

  @ApiProperty({ example: 'br1' })
  tagLine: string;

  @ApiProperty({ example: 3789 })
  profileIconId: number;

  @ApiProperty({ example: 492 })
  summonerLevel: number;

  @ApiProperty({ example: 5, description: 'Number of new matches enqueued for processing' })
  matchesEnqueued: number;
}
