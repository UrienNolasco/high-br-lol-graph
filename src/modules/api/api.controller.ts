import { Controller, Get } from '@nestjs/common';
import { RateLimitService } from '../../core/riot/rate-limit.service';

@Controller('api')
export class ApiController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  @Get('rate-limit/status')
  getRateLimitStatus(): any {
    return this.rateLimitService.getStatus();
  }

  @Get('rate-limit/reset')
  resetRateLimit(): { message: string } {
    this.rateLimitService.resetTokens();
    return { message: 'Rate limit tokens resetados com sucesso' };
  }
}
