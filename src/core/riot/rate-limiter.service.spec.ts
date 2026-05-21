import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RateLimiterService } from './rate-limiter.service';
import { LockService } from '../lock/lock.service';
import { RedisService } from '../redis/redis.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockRedis: Record<string, jest.Mock>;
  let mockLockService: jest.Mocked<Pick<LockService, 'acquireLock' | 'releaseLock'>>;
  let mockRedisService: { client: Record<string, jest.Mock> };

  beforeEach(async () => {
    mockRedis = {
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      zadd: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
    };

    mockRedisService = { client: mockRedis };

    mockLockService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };

    const mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: LockService, useValue: mockLockService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return status with available tokens', async () => {
      mockRedis.zcard.mockResolvedValue(50);

      const result = await service.getStatus();

      expect(result).toEqual({
        requestsInWindow: 50,
        maxRequests: 100,
        canProceed: true,
      });
      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
    });

    it('should return status with rate limit exceeded', async () => {
      mockRedis.zcard.mockResolvedValue(100);

      const result = await service.getStatus();

      expect(result).toEqual({
        requestsInWindow: 100,
        maxRequests: 100,
        canProceed: false,
      });
    });

    it('should handle Redis error gracefully', async () => {
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('Redis error'));

      const result = await service.getStatus();

      expect(result).toEqual({
        requestsInWindow: 100,
        maxRequests: 100,
        canProceed: false,
      });
    });

    it('should remove old timestamps before counting', async () => {
      mockRedis.zcard.mockResolvedValue(45);

      await service.getStatus();

      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all rate limit keys when no apiKey provided', async () => {
      mockRedis.keys.mockResolvedValue([
        'riot_requests:abc123',
        'riot_requests:def456',
      ]);

      await service.clear();

      expect(mockRedis.keys).toHaveBeenCalledWith('riot_requests:*');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'riot_requests:abc123',
        'riot_requests:def456',
        'riot_requests',
      );
    });

    it('should clear only specific apiKey when provided', async () => {
      await service.clear('test-api-key');

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringMatching(/^riot_requests:/),
      );
    });

    it('should handle empty keys array', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await service.clear();

      expect(mockRedis.del).toHaveBeenCalledWith('riot_requests');
    });

    it('should handle Redis error gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      await expect(service.clear()).resolves.not.toThrow();
    });
  });

  describe('throttle', () => {
    it('should allow request when under limit', async () => {
      mockRedis.zcard.mockResolvedValue(50);
      mockLockService.acquireLock.mockResolvedValue(true);

      await expect(service.throttle()).resolves.not.toThrow();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockLockService.releaseLock).toHaveBeenCalled();
    });

    it('should wait and retry when rate limit exceeded', async () => {
      mockRedis.zcard.mockResolvedValueOnce(100).mockResolvedValueOnce(99);
      mockLockService.acquireLock.mockResolvedValue(true);

      const throttlePromise = service.throttle();

      await expect(throttlePromise).resolves.not.toThrow();
      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('should handle lock acquisition failure', async () => {
      let callCount = 0;
      mockLockService.acquireLock.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 2);
      });
      mockRedis.zcard.mockResolvedValue(50);

      const originalDelay = service['delay'];
      service['delay'] = jest.fn().mockResolvedValue(undefined);

      try {
        await service.throttle();
        expect(mockLockService.acquireLock).toHaveBeenCalledTimes(2);
      } finally {
        service['delay'] = originalDelay;
      }
    });

    it('should release lock even on error', async () => {
      let zremrangeCount = 0;
      let zcardCount = 0;

      mockRedis.zremrangebyscore.mockImplementation(() => {
        zremrangeCount++;
        if (zremrangeCount === 1) {
          return Promise.reject(new Error('Redis error'));
        }
        return Promise.resolve(0);
      });

      mockRedis.zcard.mockImplementation(() => {
        zcardCount++;
        if (zcardCount === 1) {
          return Promise.reject(new Error('Redis error'));
        }
        return Promise.resolve(50);
      });

      mockLockService.acquireLock.mockResolvedValue(true);

      const originalDelay = service['delay'];
      service['delay'] = jest.fn().mockResolvedValue(undefined);

      try {
        await service.throttle();
        expect(mockLockService.releaseLock).toHaveBeenCalled();
      } finally {
        service['delay'] = originalDelay;
      }
    });
  });
});
