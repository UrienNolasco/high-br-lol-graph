import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(private readonly rateLimitService: RateLimitService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    // Aplica rate limiting antes de fazer a requisição
    await this.rateLimitService.waitForToken();

    this.logger.debug('Rate limit verificado, prosseguindo com requisição');

    return next.handle();
  }
}
