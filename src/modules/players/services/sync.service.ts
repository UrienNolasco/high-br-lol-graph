import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Redis, ChainableCommander } from 'ioredis';

@Injectable()
export class SyncService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
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

    this.logger.setContext(SyncService.name);

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

  pipeline(): ChainableCommander {
    return this.redis.pipeline();
  }

  async hset(key: string, ...args: unknown[]) {
    return this.redis.hset(key, ...(args as [string, string]));
  }

  async hget(key: string, field: string) {
    return this.redis.hget(key, field);
  }

  async hgetall(key: string) {
    return this.redis.hgetall(key);
  }

  async smembers(key: string) {
    return this.redis.smembers(key);
  }

  async sadd(key: string, ...members: string[]) {
    return this.redis.sadd(key, ...members);
  }

  async expire(key: string, seconds: number) {
    return this.redis.expire(key, seconds);
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}
