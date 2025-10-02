import { ApiProperty } from '@nestjs/swagger';

export class RateLimitStatusDto {
  @ApiProperty({
    example: 42,
    description: 'O número de requisições feitas na janela de tempo atual.',
  })
  requestsInWindow: number;

  @ApiProperty({
    example: 100,
    description:
      'O número máximo de requisições permitidas na janela de tempo.',
  })
  maxRequests: number;

  @ApiProperty({
    example: true,
    description: 'Indica se uma nova requisição seria permitida neste momento.',
  })
  canProceed: boolean;
}
