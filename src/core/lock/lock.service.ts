import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class LockService implements OnModuleDestroy {
  private readonly logger = new Logger(LockService.name);
  private readonly redis: Redis;
  private readonly lockTimeoutMs: number = 5000; // Lock expira em 5s

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'redis');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.log(
        `LockService conectado ao Redis em ${redisHost}:${redisPort}`,
      );
    });

    this.redis.on('error', (error) => {
      this.logger.error('Erro na conexão do LockService com Redis:', error);
    });
  }

  async acquireLock(
    lockName: string,
    retryDelayMs = 50,
    maxRetries = 100,
  ): Promise<boolean> {
    const lockKey = `lock:${lockName}`;
    let retries = 0;

    while (retries < maxRetries) {
      const result = await this.redis.set(
        lockKey,
        'locked',
        'PX',
        this.lockTimeoutMs,
        'NX',
      );
      if (result === 'OK') {
        return true; // Lock adquirido
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    this.logger.warn(
      `Não foi possível adquirir o lock para "${lockName}" após ${maxRetries} tentativas.`,
    );
    return false; // Não foi possível adquirir o lock
  }

  async releaseLock(lockName: string): Promise<void> {
    const lockKey = `lock:${lockName}`;
    try {
      await this.redis.del(lockKey);
    } catch (error) {
      this.logger.error(`Erro ao liberar o lock "${lockName}":`, error);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Conexão do LockService com Redis fechada');
    }
  }
}
