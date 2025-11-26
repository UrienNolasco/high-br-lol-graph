import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { LockService } from '../lock/lock.service';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private redis: Redis | null = null;
  private readonly WINDOW_SIZE_SECONDS = 120; // 2 minutos
  private readonly MAX_REQUESTS = 100;
  private readonly RETRY_DELAY_MS = 1000; // 1 segundo
  private readonly LOCK_NAME = 'riot_rate_limiter_lock';
  private readonly MAX_THROTTLE_ATTEMPTS = 300; // Máximo de tentativas no throttle (5 minutos)
  private readonly MAX_LOCK_WAIT_MS = 300000; // Timeout máximo de 5 minutos para adquirir lock

  constructor(
    private configService: ConfigService,
    private readonly lockService: LockService,
  ) {
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
      this.logger.log(`Conectado ao Redis em ${redisHost}:${redisPort}`);
    });

    this.redis.on('error', (error) => {
      this.logger.error('Erro na conexão com Redis:', error);
    });
  }

  /**
   * Método principal que gerencia o rate limit.
   * Implementa algoritmo de janela deslizante com Redis.
   *
   * @returns Promise<void> - Resolve quando a permissão é concedida
   */
  async throttle(): Promise<void> {
    const overallStartTime = Date.now();
    let lockAttempts = 0;
    const maxLockAttempts = 60;

    while (lockAttempts < maxLockAttempts) {
      lockAttempts++;

      if (Date.now() - overallStartTime > this.MAX_LOCK_WAIT_MS) {
        throw new Error(
          `Timeout ao tentar adquirir permissão do rate limiter após ${this.MAX_LOCK_WAIT_MS}ms`,
        );
      }

      const lockAcquired = await this.lockService.acquireLock(
        this.LOCK_NAME,
        50,
        20,
      );

      if (!lockAcquired) {
        const backoffDelay = Math.min(
          this.RETRY_DELAY_MS * Math.pow(1.5, lockAttempts - 1),
          10000,
        );

        if (lockAttempts % 10 === 0) {
          this.logger.warn(
            `Tentativa ${lockAttempts}/${maxLockAttempts} de adquirir lock. ` +
              `Aguardando ${Math.round(backoffDelay)}ms...`,
          );
        }

        await this.delay(backoffDelay);
        continue;
      }

      try {
        const startTime = Date.now();
        let attempts = 0;

        while (attempts < this.MAX_THROTTLE_ATTEMPTS) {
          attempts++;
          const currentTimestamp = Date.now();
          const windowStart =
            currentTimestamp - this.WINDOW_SIZE_SECONDS * 1000;

          try {
            if (!this.redis) {
              throw new Error('Redis não inicializado');
            }

            await this.redis.zremrangebyscore(
              'riot_requests',
              '-inf',
              windowStart,
            );

            const requestCount = await this.redis.zcard('riot_requests');

            if (requestCount < this.MAX_REQUESTS) {
              await this.redis.zadd(
                'riot_requests',
                currentTimestamp,
                currentTimestamp,
              );
              const waitTime = Date.now() - startTime;
              if (waitTime > 1000) {
                this.logger.log(
                  `Permissão concedida após ${attempts} tentativa(s) em ${waitTime}ms. ` +
                    `Requisições na janela: ${requestCount + 1}/${this.MAX_REQUESTS}`,
                );
              }
              return;
            }

            if (attempts % 30 === 0) {
              this.logger.warn(
                `Rate limit excedido. Tentativa ${attempts}/${this.MAX_THROTTLE_ATTEMPTS}. ` +
                  `Requisições na janela: ${requestCount}/${this.MAX_REQUESTS}. ` +
                  `Aguardando ${this.RETRY_DELAY_MS}ms...`,
              );
            }

            await this.delay(this.RETRY_DELAY_MS);
          } catch (error) {
            this.logger.error('Erro no rate limiter:', error);
            await this.delay(this.RETRY_DELAY_MS);
          }
        }

        throw new Error(
          `Excedido número máximo de tentativas (${this.MAX_THROTTLE_ATTEMPTS}) para obter permissão do rate limiter`,
        );
      } finally {
        await this.lockService.releaseLock(this.LOCK_NAME);
      }
    }

    throw new Error(
      `Não foi possível adquirir lock para o rate limiter após ${maxLockAttempts} tentativas`,
    );
  }

  /**
   * Verifica o status atual do rate limit sem bloquear
   *
   * @returns Promise<{requestsInWindow: number, maxRequests: number, canProceed: boolean}>
   */
  async getStatus(): Promise<{
    requestsInWindow: number;
    maxRequests: number;
    canProceed: boolean;
  }> {
    try {
      if (!this.redis) {
        throw new Error('Redis não inicializado');
      }

      const currentTimestamp = Date.now();
      const windowStart = currentTimestamp - this.WINDOW_SIZE_SECONDS * 1000;

      await this.redis.zremrangebyscore('riot_requests', '-inf', windowStart);

      const requestCount = await this.redis.zcard('riot_requests');

      return {
        requestsInWindow: requestCount,
        maxRequests: this.MAX_REQUESTS,
        canProceed: requestCount < this.MAX_REQUESTS,
      };
    } catch (error) {
      this.logger.error('Erro ao obter status do rate limit:', error);
      return {
        requestsInWindow: this.MAX_REQUESTS,
        maxRequests: this.MAX_REQUESTS,
        canProceed: false,
      };
    }
  }

  /**
   * Limpa todos os registros de rate limit (útil para testes)
   */
  async clear(): Promise<void> {
    try {
      if (!this.redis) {
        throw new Error('Redis não inicializado');
      }
      await this.redis.del('riot_requests');
      this.logger.log('Rate limit limpo com sucesso');
    } catch (error) {
      this.logger.error('Erro ao limpar rate limit:', error);
    }
  }

  /**
   * Fecha a conexão com Redis
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Conexão com Redis fechada');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
