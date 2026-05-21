import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../../../core/redis/redis.service';
import { ChainableCommander } from 'ioredis';

@Injectable()
export class SyncService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SyncService.name);
  }

  pipeline(): ChainableCommander {
    return this.redisService.client.pipeline();
  }

  async hset(key: string, ...args: unknown[]) {
    return this.redisService.client.hset(key, ...(args as [string, string]));
  }

  async hget(key: string, field: string) {
    return this.redisService.client.hget(key, field);
  }

  async hgetall(key: string) {
    return this.redisService.client.hgetall(key);
  }

  async smembers(key: string) {
    return this.redisService.client.smembers(key);
  }

  async sadd(key: string, ...members: string[]) {
    return this.redisService.client.sadd(key, ...members);
  }

  async expire(key: string, seconds: number) {
    return this.redisService.client.expire(key, seconds);
  }
}
