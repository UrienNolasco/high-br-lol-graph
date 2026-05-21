import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import { getErrorMessage } from '../logger/get-error-message';
import { LockService } from '../lock/lock.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RateLimiterService {
  private readonly WINDOW_SIZE_SECONDS = 120;
  private readonly MAX_REQUESTS = 100;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly LOCK_NAME = 'riot_rate_limiter_lock';

  constructor(
    private readonly lockService: LockService,
    private readonly redisService: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RateLimiterService.name);
  }

  private getApiKeyIdentifier(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex')
      .substring(0, 16);
  }

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
          await this.redisService.client.zremrangebyscore(
            redisKey,
            '-inf',
            windowStart,
          );

          const requestCount = await this.redisService.client.zcard(redisKey);

          if (requestCount < this.MAX_REQUESTS) {
            await this.redisService.client.zadd(
              redisKey,
              currentTimestamp,
              currentTimestamp,
            );
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

  async getStatus(apiKey?: string): Promise<{
    requestsInWindow: number;
    maxRequests: number;
    canProceed: boolean;
  }> {
    try {
      const apiKeyId = apiKey ? this.getApiKeyIdentifier(apiKey) : 'default';
      const redisKey = `riot_requests:${apiKeyId}`;

      const currentTimestamp = Date.now();
      const windowStart = currentTimestamp - this.WINDOW_SIZE_SECONDS * 1000;

      await this.redisService.client.zremrangebyscore(
        redisKey,
        '-inf',
        windowStart,
      );

      const requestCount = await this.redisService.client.zcard(redisKey);

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

  async clear(apiKey?: string): Promise<void> {
    try {
      if (apiKey) {
        const apiKeyId = this.getApiKeyIdentifier(apiKey);
        const redisKey = `riot_requests:${apiKeyId}`;
        await this.redisService.client.del(redisKey);
        this.logger.info(
          { operation: 'rate_limit_clear', apiKeyHash: apiKeyId },
          'Rate limit cleared',
        );
      } else {
        const keys = await this.redisService.client.keys('riot_requests:*');
        keys.push('riot_requests');

        if (keys.length > 0) {
          await this.redisService.client.del(...keys);
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
