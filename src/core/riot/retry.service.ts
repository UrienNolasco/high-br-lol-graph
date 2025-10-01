import { Injectable, Logger } from '@nestjs/common';
import {
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

interface HttpError {
  status?: number;
  message?: string;
  response?: {
    status: number;
    data?: unknown;
  };
  code?: string;
  stack?: string;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  private readonly config: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 segundo
    maxDelay: 30000, // 30 segundos
    backoffMultiplier: 2,
    retryableStatusCodes: [
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ],
  };

  /**
   * Executa uma função com retry automático em caso de falha
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.warn(
            `Tentativa ${attempt + 1}/${this.config.maxRetries + 1} ${context ? `para ${context}` : ''}`,
          );
        }

        const result = await operation();

        if (attempt > 0) {
          this.logger.log(
            `Operação bem-sucedida na tentativa ${attempt + 1} ${context ? `para ${context}` : ''}`,
          );
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Verifica se o erro é retryable
        if (
          !this.isRetryableError(error) ||
          attempt === this.config.maxRetries
        ) {
          // Log detalhado seguindo o padrão do riot.module.ts
          const errorMessage = this.getErrorMessage(error);
          this.logger.error(
            `Falha final ${context ? `em ${context}` : ''} após ${attempt + 1} tentativas: ${errorMessage}`,
            (error as HttpError).stack || error,
          );
          throw error;
        }

        // Calcula delay para próxima tentativa
        const delay = this.calculateDelay(attempt);

        // Log de warning seguindo o padrão do riot.module.ts
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Falha na tentativa ${attempt + 1}/${this.config.maxRetries + 1} ${context ? `para ${context}` : ''}: ${errorMessage}. ` +
            `Tentando novamente em ${delay}ms...`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Erro desconhecido durante retry');
  }

  /**
   * Verifica se um erro é retryable
   * Segue o mesmo padrão do riot.module.ts para consistência
   */
  private isRetryableError(error: unknown): boolean {
    const httpError = error as HttpError;

    // Verifica se é uma exceção HTTP do NestJS
    if (httpError?.status || httpError?.response?.status) {
      const status = httpError.status || httpError.response?.status;
      if (status) {
        return this.config.retryableStatusCodes.includes(status);
      }
    }

    // Verifica se é um erro de rede (sem response) - mesmo padrão do riot.module.ts
    if (
      httpError?.code === 'ECONNABORTED' ||
      httpError?.code === 'ENOTFOUND' ||
      httpError?.code === 'ECONNREFUSED'
    ) {
      return true;
    }

    // Verifica se é um timeout
    if (httpError?.message?.toLowerCase().includes('timeout')) {
      return true;
    }

    // Verifica se é uma exceção específica do NestJS que pode ser retryable
    if (
      error instanceof ServiceUnavailableException ||
      error instanceof GatewayTimeoutException ||
      error instanceof InternalServerErrorException ||
      (error instanceof HttpException &&
        this.config.retryableStatusCodes.includes(error.getStatus()))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Extrai mensagem de erro seguindo o padrão do riot.module.ts
   */
  private getErrorMessage(error: unknown): string {
    const httpError = error as HttpError;

    // Se é uma exceção HTTP do NestJS
    if (httpError?.status && httpError?.message) {
      return `Status ${httpError.status}: ${httpError.message}`;
    }

    // Se tem response HTTP
    if (httpError?.response?.status && httpError?.response?.data) {
      const status = httpError.response.status;
      const data = httpError.response.data;
      return `HTTP ${status}: ${JSON.stringify(data)}`;
    }

    // Se é um erro de rede
    if (httpError?.code) {
      return `Erro de rede (${httpError.code}): ${httpError.message || 'Erro desconhecido'}`;
    }

    // Erro genérico
    return httpError?.message || 'Erro desconhecido';
  }

  /**
   * Calcula o delay para próxima tentativa usando backoff exponencial
   */
  private calculateDelay(attempt: number): number {
    const delay =
      this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt);

    // Adiciona jitter para evitar thundering herd
    const jitter = Math.random() * 0.1 * delay;

    return Math.min(delay + jitter, this.config.maxDelay);
  }

  /**
   * Utilitário para aguardar um tempo específico
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retorna a configuração atual
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Atualiza a configuração de retry
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Configuração de retry atualizada:', this.config);
  }
}
