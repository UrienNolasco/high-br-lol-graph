import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'UrienMano', description: 'Nome do jogador no jogo' })
  @IsString()
  @IsNotEmpty()
  gameName: string;

  @ApiProperty({ example: 'br1', description: 'Tag line do jogador' })
  @IsString()
  @IsNotEmpty()
  tagLine: string;

  @ApiProperty({ example: 'br1', description: 'Região', required: false })
  @IsString()
  @IsOptional()
  region?: string;
}
