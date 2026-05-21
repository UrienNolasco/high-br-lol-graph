import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getErrorMessage } from '../logger/get-error-message';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LockService {
  private readonly lockTimeoutMs: number = 130000;

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LockService.name);
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
      const result = await this.redisService.client.set(
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
      await this.redisService.client.del(lockKey);
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
}
