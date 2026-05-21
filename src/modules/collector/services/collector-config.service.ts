import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Redis } from 'ioredis';

@Injectable()
export class CollectorConfigService implements OnModuleInit, OnModuleDestroy {
  readonly redis: Redis;

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

    this.logger.setContext(CollectorConfigService.name);

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

  async onModuleInit(): Promise<void> {
    const enabled = await this.redis.get('collector:enabled');
    if (enabled === null) {
      const defaultEnabled = this.configService.get<string>(
        'COLLECTOR_ENABLED',
        'false',
      );
      await this.redis.set('collector:enabled', defaultEnabled);
    }

    const startHour = await this.redis.get('collector:start_hour');
    if (startHour === null) {
      const defaultStart = this.configService.get<string>(
        'COLLECTOR_START_HOUR',
        '1',
      );
      await this.redis.set('collector:start_hour', defaultStart);
    }

    const endHour = await this.redis.get('collector:end_hour');
    if (endHour === null) {
      const defaultEnd = this.configService.get<string>(
        'COLLECTOR_END_HOUR',
        '8',
      );
      await this.redis.set('collector:end_hour', defaultEnd);
    }

    this.logger.info(
      { event: 'collector_initialized' },
      'Collector initialized',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }

  async isEnabled(): Promise<boolean> {
    const value = await this.redis.get('collector:enabled');
    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.redis.set('collector:enabled', String(enabled));
  }

  async getWindow(): Promise<{ startHour: number; endHour: number }> {
    const startHour = await this.redis.get('collector:start_hour');
    const endHour = await this.redis.get('collector:end_hour');
    return {
      startHour: parseInt(startHour ?? '1', 10),
      endHour: parseInt(endHour ?? '8', 10),
    };
  }

  async getLastRun(): Promise<string | null> {
    return this.redis.get('collector:last_run');
  }

  async setLastRun(): Promise<void> {
    await this.redis.set('collector:last_run', new Date().toISOString());
  }
}
