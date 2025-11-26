import { ApiProperty } from '@nestjs/swagger';

export class ChampionListItemDto {
  @ApiProperty({ example: 'Aatrox' })
  name: string;

  @ApiProperty({ example: '266' })
  id: string;

  @ApiProperty({ example: 266 })
  key: number;

  @ApiProperty({ example: 'a Espada Darkin' })
  title: string;

  @ApiProperty({ example: '15.19.1' })
  version: string;
}

export class ChampionListDto {
  @ApiProperty({ type: [ChampionListItemDto] })
  champions: ChampionListItemDto[];

  @ApiProperty({ example: 170 })
  total: number;
}
