import { ApiProperty } from '@nestjs/swagger';
import { ChampionImagesDto } from './champion-images.dto';

export class ChampionStatsDto {
  @ApiProperty({ example: 'Aatrox' })
  championName: string;

  @ApiProperty({ example: 266 })
  championId: number;

  @ApiProperty({ example: 55.7 })
  winRate: number;

  @ApiProperty({ example: 1234 })
  gamesPlayed: number;

  @ApiProperty({ example: 687 })
  wins: number;

  @ApiProperty({ example: 547 })
  losses: number;

  @ApiProperty({ type: ChampionImagesDto })
  images: ChampionImagesDto;

  @ApiProperty({ example: 2.5 })
  kda: number;

  @ApiProperty({ example: 650.3 })
  dpm: number;

  @ApiProperty({ example: 7.2 })
  cspm: number;

  @ApiProperty({ example: 450.8 })
  gpm: number;

  @ApiProperty({ example: 15.5 })
  banRate: number;

  @ApiProperty({
    example: 'A',
    description: 'Tier do campeão (S+, S, A, B, C, D ou "Dados Insuficientes")',
    enum: ['S+', 'S', 'A', 'B', 'C', 'D', 'Dados Insuficientes'],
  })
  tier: string;

  @ApiProperty({
    example: 5,
    description:
      'Rank do campeão dentro da role (1 = melhor, null = dados insuficientes)',
    nullable: true,
  })
  rank: number | null;

  @ApiProperty({
    example: 'TOP',
    description:
      'Role primária do campeão no patch (inferida baseada nos matchups)',
    nullable: true,
  })
  primaryRole?: string;
}

export class PaginatedChampionStatsDto {
  @ApiProperty({ type: [ChampionStatsDto] })
  data: ChampionStatsDto[];

  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
