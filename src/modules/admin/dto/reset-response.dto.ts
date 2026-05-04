import { ApiProperty } from '@nestjs/swagger';

export class ResetResponseDto {
  @ApiProperty({
    example: 'Rate limit tokens resetados com sucesso',
    description: 'Mensagem de confirmação da operação.',
  })
  message: string;
}
