import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../logger/get-error-message';

@Injectable()
export class RetryService {
  private readonly maxRetries = 5;
  private readonly baseDelay = 2000;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(RetryService.name);
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = this.maxRetries,
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        const totalDuration = Date.now() - startTime;
        if (attempt > 1) {
          this.logger.info(
            {
              operation: operationName,
              attempt,
              maxRetries,
              duration: totalDuration,
              event: 'retry_success',
            },
            `Operation succeeded after ${attempt} attempt(s)`,
          );
        }
        return result;
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          const totalDuration = Date.now() - startTime;
          this.logger.error(
            {
              operation: operationName,
              attempt,
              maxRetries,
              duration: totalDuration,
              error: getErrorMessage(lastError),
              event: 'retry_failed',
            },
            `Final failure after ${maxRetries} attempts`,
          );
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        this.logger.warn(
          {
            operation: operationName,
            attempt,
            maxRetries,
            delay,
            error: getErrorMessage(lastError),
          },
          `Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`,
        );

        await this.delay(delay);
      }
    }

    throw lastError ?? new Error('executeWithRetry: unreachable');
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 10000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
