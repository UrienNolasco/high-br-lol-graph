import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 segundo

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = this.maxRetries,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          this.logger.error(
            `Falha final em ${operationName} após ${maxRetries} tentativas`,
            error,
          );
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        this.logger.warn(
          `Tentativa ${attempt}/${maxRetries} falhou para ${operationName}. ` +
            `Tentando novamente em ${delay}ms...`,
        );

        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff com jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // até 1 segundo de jitter
    return Math.min(exponentialDelay + jitter, 10000); // máximo 10 segundos
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
