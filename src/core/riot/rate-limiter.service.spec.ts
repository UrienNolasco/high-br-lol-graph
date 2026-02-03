import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service';
import { LockService } from '../lock/lock.service';
import { Redis } from 'ioredis';

// Mock do ioredis antes de importar o serviço
const mockRedisInstance = {
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
  zadd: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  return {
    Redis: MockRedis,
    default: MockRedis,
  };
});

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockRedis: jest.Mocked<Redis>;
  let mockLockService: jest.Mocked<LockService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockLockService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LockService>;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LockService, useValue: mockLockService },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);

    // Obter a instância mockada do Redis que foi criada no construtor
    mockRedis = service['redis'] as jest.Mocked<Redis>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Resetar os mocks do Redis para valores padrão
    mockRedis.zremrangebyscore.mockResolvedValue(0);
    mockRedis.zcard.mockResolvedValue(0);
    mockRedis.zadd.mockResolvedValue('1');
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
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
      // Primeira chamada: falha ao adquirir lock, segunda: sucesso
      let callCount = 0;
      mockLockService.acquireLock.mockImplementation(async () => {
        callCount++;
        return callCount === 2; // Primeira falha, segunda sucesso
      });
      mockRedis.zcard.mockResolvedValue(50);

      // Mock do delay para evitar esperas longas
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
      // Mock para que o erro aconteça uma vez e depois resolva
      let zremrangeCount = 0;
      let zcardCount = 0;

      mockRedis.zremrangebyscore.mockImplementation(async () => {
        zremrangeCount++;
        if (zremrangeCount === 1) {
          throw new Error('Redis error');
        }
        return 0;
      });

      mockRedis.zcard.mockImplementation(async () => {
        zcardCount++;
        if (zcardCount === 1) {
          throw new Error('Redis error');
        }
        return 50; // Após os erros, retorna valor válido (< MAX_REQUESTS)
      });

      mockLockService.acquireLock.mockResolvedValue(true);

      // Mock do delay para evitar esperas longas
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
