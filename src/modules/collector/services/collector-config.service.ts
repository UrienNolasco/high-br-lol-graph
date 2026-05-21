import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../../../core/redis/redis.service';

@Injectable()
export class CollectorConfigService implements OnModuleInit {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CollectorConfigService.name);
  }

  async onModuleInit(): Promise<void> {
    const enabled = await this.redisService.client.get('collector:enabled');
    if (enabled === null) {
      const defaultEnabled = this.configService.get<string>(
        'COLLECTOR_ENABLED',
        'false',
      );
      await this.redisService.client.set('collector:enabled', defaultEnabled);
    }

    const startHour = await this.redisService.client.get(
      'collector:start_hour',
    );
    if (startHour === null) {
      const defaultStart = this.configService.get<string>(
        'COLLECTOR_START_HOUR',
        '1',
      );
      await this.redisService.client.set('collector:start_hour', defaultStart);
    }

    const endHour = await this.redisService.client.get('collector:end_hour');
    if (endHour === null) {
      const defaultEnd = this.configService.get<string>(
        'COLLECTOR_END_HOUR',
        '8',
      );
      await this.redisService.client.set('collector:end_hour', defaultEnd);
    }

    this.logger.info(
      { event: 'collector_initialized' },
      'Collector initialized',
    );
  }

  async isEnabled(): Promise<boolean> {
    const value = await this.redisService.client.get('collector:enabled');
    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.redisService.client.set('collector:enabled', String(enabled));
  }

  async getWindow(): Promise<{ startHour: number; endHour: number }> {
    const startHour = await this.redisService.client.get(
      'collector:start_hour',
    );
    const endHour = await this.redisService.client.get('collector:end_hour');
    return {
      startHour: parseInt(startHour ?? '1', 10),
      endHour: parseInt(endHour ?? '8', 10),
    };
  }

  async getLastRun(): Promise<string | null> {
    return this.redisService.client.get('collector:last_run');
  }

  async setLastRun(): Promise<void> {
    await this.redisService.client.set(
      'collector:last_run',
      new Date().toISOString(),
    );
  }
}
