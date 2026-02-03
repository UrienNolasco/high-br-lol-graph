import { ApiProperty } from '@nestjs/swagger';

export class UserUpdateResponseDto {
  @ApiProperty({ example: 'u6xZ_...', description: 'PUUID do jogador' })
  puuid: string;

  @ApiProperty({
    example: 'processing',
    description: 'Status da solicitação',
    enum: ['processing', 'up_to_date'],
  })
  status: 'processing' | 'up_to_date';

  @ApiProperty({ example: 5, description: 'Número de novas partidas enfileiradas' })
  newMatches: number;

  @ApiProperty({ example: '5 novas partidas enfileiradas.', description: 'Mensagem descritiva' })
  message: string;
}
