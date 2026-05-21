import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
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

    this.logger.setContext(RedisService.name);

    this.redis.on('connect', () => {
      this.logger.info(
        { operation: 'redis_connect', host: redisHost, port: redisPort },
        'Connected to Redis',
      );
    });

    this.redis.on('error', (error: { message?: string }) => {
      this.logger.error(
        { operation: 'redis_error', error: error.message },
        'Redis connection error',
      );
    });
  }

  get client(): Redis {
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}
