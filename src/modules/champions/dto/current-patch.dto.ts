import { ApiProperty } from '@nestjs/swagger';

export class PatchInfoDto {
  @ApiProperty({
    description: 'Patch simplificado do League of Legends',
    example: '15.23',
  })
  patch: string;

  @ApiProperty({
    description: 'Versão completa do patch',
    example: '15.23.1',
  })
  fullVersion: string;
}

export class CurrentPatchDto {
  @ApiProperty({
    description:
      'Lista de todos os patches disponíveis, ordenados do mais recente para o mais antigo',
    type: [PatchInfoDto],
    example: [
      { patch: '15.23', fullVersion: '15.23.1' },
      { patch: '15.22', fullVersion: '15.22.1' },
      { patch: '15.21', fullVersion: '15.21.1' },
    ],
  })
  patches: PatchInfoDto[];

  @ApiProperty({
    description: 'Patch mais recente (primeiro da lista)',
    type: PatchInfoDto,
  })
  current: PatchInfoDto;
}
