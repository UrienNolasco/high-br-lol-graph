import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { getErrorMessage } from '../logger/get-error-message';

@Injectable()
export class LockService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly lockTimeoutMs: number = 130000;

  constructor(
    private configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'redis');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    this.logger.setContext(LockService.name);

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

  async acquireLock(
    lockName: string,
    retryDelayMs = 50,
    maxRetries = 100,
  ): Promise<boolean> {
    const lockKey = `lock:${lockName}`;
    const startTime = Date.now();
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
        const duration = Date.now() - startTime;
        this.logger.debug(
          {
            operation: 'lock_acquire',
            lockKey,
            ttl: this.lockTimeoutMs,
            attempts: retries + 1,
            duration,
          },
          retries > 0 ? 'Lock acquired after retries' : 'Lock acquired',
        );
        return true;
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    const duration = Date.now() - startTime;
    this.logger.warn(
      {
        operation: 'lock_acquire',
        lockKey,
        ttl: this.lockTimeoutMs,
        attempts: maxRetries,
        duration,
        action: 'failed',
      },
      'Failed to acquire lock',
    );
    return false;
  }

  async releaseLock(lockName: string): Promise<void> {
    const lockKey = `lock:${lockName}`;
    const startTime = Date.now();
    try {
      await this.redis.del(lockKey);
      this.logger.debug(
        {
          operation: 'lock_release',
          lockKey,
          duration: Date.now() - startTime,
        },
        'Lock released',
      );
    } catch (error) {
      this.logger.error(
        {
          operation: 'lock_release',
          lockKey,
          duration: Date.now() - startTime,
          error: getErrorMessage(error),
        },
        'Failed to release lock',
      );
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}
