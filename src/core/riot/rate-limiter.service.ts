import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { getErrorMessage } from '../logger/get-error-message';

import { LockService } from '../lock/lock.service';

@Injectable()
export class RateLimiterService {
  private redis: Redis | null = null;
  private readonly WINDOW_SIZE_SECONDS = 120;
  private readonly MAX_REQUESTS = 100;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly LOCK_NAME = 'riot_rate_limiter_lock';

  constructor(
    private configService: ConfigService,
    private readonly lockService: LockService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RateLimiterService.name);
    this.initializeRedis();
  }

  private initializeRedis() {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.info(
        { operation: 'redis_connect', host: redisHost, port: redisPort },
        'Connected to Redis',
      );
    });

    this.redis.on('error', (error) => {
      this.logger.error(
        { operation: 'redis_error', error: error.message },
        'Redis connection error',
      );
    });
  }

  /**
   * Gera um identificador único e seguro para a API key (hash)
   */
  private getApiKeyIdentifier(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Método principal que gerencia o rate limit.
   * Implementa algoritmo de janela deslizante com Redis.
   * Cada API key tem seu próprio contador de rate limit.
   *
   * @param apiKey A API key para rastrear o rate limit separadamente (opcional, para retrocompatibilidade)
   * @returns Promise<void> - Resolve quando a permissão é concedida
   */
  async throttle(apiKey?: string): Promise<void> {
    const apiKeyId = apiKey ? this.getApiKeyIdentifier(apiKey) : 'default';
    const redisKey = `riot_requests:${apiKeyId}`;
    const lockName = `${this.LOCK_NAME}:${apiKeyId}`;

    const lockAcquired = await this.lockService.acquireLock(lockName);
    if (!lockAcquired) {
      this.logger.warn(
        {
          operation: 'rate_limit',
          apiKeyHash: apiKeyId,
          action: 'lock_failed',
        },
        'Failed to acquire rate limiter lock',
      );
      await this.delay(this.RETRY_DELAY_MS * 2);
      return this.throttle(apiKey);
    }

    try {
      const startTime = Date.now();
      let attempts = 0;

      while (true) {
        attempts++;
        const currentTimestamp = Date.now();
        const windowStart = currentTimestamp - this.WINDOW_SIZE_SECONDS * 1000;

        try {
          if (!this.redis) {
            throw new Error('Redis not initialized');
          }

          await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

          const requestCount = await this.redis.zcard(redisKey);

          if (requestCount < this.MAX_REQUESTS) {
            await this.redis.zadd(redisKey, currentTimestamp, currentTimestamp);
            const waitTime = Date.now() - startTime;
            if (waitTime > 0) {
              this.logger.debug(
                {
                  operation: 'rate_limit',
                  apiKeyHash: apiKeyId,
                  action: 'granted',
                  count: requestCount + 1,
                  max: this.MAX_REQUESTS,
                  duration: waitTime,
                  attempts,
                },
                'Rate limit granted',
              );
            }
            return;
          }

          this.logger.warn(
            {
              operation: 'rate_limit',
              apiKeyHash: apiKeyId,
              action: 'waiting',
              count: requestCount,
              max: this.MAX_REQUESTS,
              attempts,
            },
            'Rate limit exceeded',
          );

          await this.delay(this.RETRY_DELAY_MS);
        } catch (error) {
          this.logger.error(
            {
              operation: 'rate_limit',
              apiKeyHash: apiKeyId,
              action: 'error',
              error: getErrorMessage(error),
            },
            'Rate limiter error',
          );
          await this.delay(this.RETRY_DELAY_MS);
        }
      }
    } finally {
      await this.lockService.releaseLock(lockName);
    }
  }

  /**
   * Verifica o status atual do rate limit sem bloquear
   *
   * @param apiKey A API key para verificar o status (opcional, para retrocompatibilidade)
   * @returns Promise<{requestsInWindow: number, maxRequests: number, canProceed: boolean}>
   */
  async getStatus(apiKey?: string): Promise<{
    requestsInWindow: number;
    maxRequests: number;
    canProceed: boolean;
  }> {
    try {
      if (!this.redis) {
        throw new Error('Redis not initialized');
      }

      const apiKeyId = apiKey ? this.getApiKeyIdentifier(apiKey) : 'default';
      const redisKey = `riot_requests:${apiKeyId}`;

      const currentTimestamp = Date.now();
      const windowStart = currentTimestamp - this.WINDOW_SIZE_SECONDS * 1000;

      await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

      const requestCount = await this.redis.zcard(redisKey);

      return {
        requestsInWindow: requestCount,
        maxRequests: this.MAX_REQUESTS,
        canProceed: requestCount < this.MAX_REQUESTS,
      };
    } catch (error) {
      this.logger.error(
        { operation: 'rate_limit_status', error: getErrorMessage(error) },
        'Failed to get rate limit status',
      );
      return {
        requestsInWindow: this.MAX_REQUESTS,
        maxRequests: this.MAX_REQUESTS,
        canProceed: false,
      };
    }
  }

  /**
   * Limpa todos os registros de rate limit (útil para testes)
   * Remove todas as chaves que começam com 'riot_requests:' para suportar múltiplas API keys
   *
   * @param apiKey Opcional: se fornecido, limpa apenas o rate limit dessa API key
   */
  async clear(apiKey?: string): Promise<void> {
    try {
      if (!this.redis) {
        throw new Error('Redis not initialized');
      }

      if (apiKey) {
        const apiKeyId = this.getApiKeyIdentifier(apiKey);
        const redisKey = `riot_requests:${apiKeyId}`;
        await this.redis.del(redisKey);
        this.logger.info(
          { operation: 'rate_limit_clear', apiKeyHash: apiKeyId },
          'Rate limit cleared',
        );
      } else {
        const keys = await this.redis.keys('riot_requests:*');
        keys.push('riot_requests');

        if (keys.length > 0) {
          await this.redis.del(...keys);
          this.logger.info(
            { operation: 'rate_limit_clear', keysCleared: keys.length },
            'Rate limit cleared',
          );
        } else {
          this.logger.debug(
            { operation: 'rate_limit_clear', action: 'skipped' },
            'No rate limit keys to clear',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { operation: 'rate_limit_clear', error: getErrorMessage(error) },
        'Failed to clear rate limit',
      );
    }
  }

  /**
   * Fecha a conexão com Redis
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
