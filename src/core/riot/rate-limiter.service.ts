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
    const lockAcquired = await this.lockService.acquireLock(this.LOCK_NAME);
    if (!lockAcquired) {
      this.logger.warn(
        'Não foi possível adquirir o lock para o rate limiter. A requisição será bloqueada e tentará novamente.',
      );
      // Se não conseguir o lock, espera um pouco e tenta o throttle todo de novo
      await this.delay(this.RETRY_DELAY_MS * 2);
      return this.throttle();
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
            throw new Error('Redis não inicializado');
          }

          // 1. Remover timestamps antigos (mais velhos que a janela)
          await this.redis.zremrangebyscore(
            'riot_requests',
            '-inf',
            windowStart,
          );

          // 2. Contar requisições dentro da janela
          const requestCount = await this.redis.zcard('riot_requests');

          // 3. Verificar se podemos prosseguir
          if (requestCount < this.MAX_REQUESTS) {
            // 4. Sim, podemos. Adicionar nosso timestamp e sair.
            await this.redis.zadd(
              'riot_requests',
              currentTimestamp,
              currentTimestamp,
            );
            const waitTime = Date.now() - startTime;
            if (waitTime > 0) {
              this.logger.debug(
                `Permissão concedida após ${attempts} tentativa(s) em ${waitTime}ms. ` +
                  `Requisições na janela: ${requestCount + 1}/${this.MAX_REQUESTS}`,
              );
            }
            return; // <-- EXIT
          }

          // 5. Não, não podemos. Logar, aguardar e tentar novamente.
          this.logger.warn(
            `Rate limit excedido. Tentativa ${attempts}. ` +
              `Requisições na janela: ${requestCount}/${this.MAX_REQUESTS}. ` +
              `Aguardando ${this.RETRY_DELAY_MS}ms...`,
          );

          await this.delay(this.RETRY_DELAY_MS);
        } catch (error) {
          this.logger.error('Erro no rate limiter:', error);

          // Em caso de erro no Redis, aguardar um pouco e tentar novamente
          await this.delay(this.RETRY_DELAY_MS);
        }
      }
    } finally {
      await this.lockService.releaseLock(this.LOCK_NAME);
    }
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
