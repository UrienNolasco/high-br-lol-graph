import { Controller, Get } from '@nestjs/common';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';

@Controller('api')
export class ApiController {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  @Get('rate-limit/status')
  getRateLimitStatus(): any {
    return this.rateLimiterService.getStatus();
  }

  @Get('rate-limit/reset')
  resetRateLimit(): { message: string } {
    this.rateLimiterService.clear();
    return { message: 'Rate limit tokens resetados com sucesso' };
  }
}
