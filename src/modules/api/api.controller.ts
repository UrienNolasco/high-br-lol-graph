import { Controller, Get } from '@nestjs/common';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';
import { ResetResponseDto } from './dto/reset-response.dto';

@ApiTags('Rate Limit')
@Controller('api')
export class ApiController {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  @Get('rate-limit/status')
  @ApiOperation({ summary: 'Obtém o status atual do rate limit' })
  @ApiResponse({
    status: 200,
    description: 'Status retornado com sucesso.',
    type: RateLimitStatusDto,
  })
  async getRateLimitStatus(): Promise<RateLimitStatusDto> {
    return this.rateLimiterService.getStatus();
  }

  @Get('rate-limit/reset')
  @ApiOperation({ summary: 'Reseta o contador do rate limit no Redis' })
  @ApiResponse({
    status: 200,
    description: 'Contador do rate limit resetado com sucesso.',
    type: ResetResponseDto,
  })
  async resetRateLimit(): Promise<ResetResponseDto> {
    await this.rateLimiterService.clear();
    return { message: 'Rate limit tokens resetados com sucesso' };
  }
}
