import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PlayerSearchDto {
  @ApiProperty({ example: 'UrienMano' })
  @IsString()
  gameName: string;

  @ApiProperty({ example: 'br1' })
  @IsString()
  tagLine: string;
}
