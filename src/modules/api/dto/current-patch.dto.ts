import { ApiProperty } from '@nestjs/swagger';

export class CurrentPatchDto {
  @ApiProperty({
    description: 'Patch atual do League of Legends',
    example: '15.23',
  })
  patch: string;

  @ApiProperty({
    description: 'Versão completa do patch',
    example: '15.23.1',
  })
  fullVersion: string;
}
