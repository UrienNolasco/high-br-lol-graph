import { ApiProperty } from '@nestjs/swagger';

export class ChampionImagesDto {
  @ApiProperty({
    example:
      'https://ddragon.leagueoflegends.com/cdn/15.23/img/champion/Aatrox.png',
    description: 'URL da imagem quadrada do campeão',
  })
  square: string;

  @ApiProperty({
    example:
      'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Aatrox_0.jpg',
    description: 'URL da tela de carregamento do campeão',
  })
  loading: string;

  @ApiProperty({
    example:
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg',
    description: 'URL da splash art do campeão',
  })
  splash: string;
}
