import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CollectorConfigService } from './collector-config.service';

jest.mock('ioredis', () => {
  const mockRedisInstance = {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  return { Redis: MockRedis, default: MockRedis };
});

describe('CollectorConfigService', () => {
  let service: CollectorConfigService;
  let redis: any;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return defaultValue;
    }),
  };

  const mockLogger = {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorConfigService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CollectorConfigService>(CollectorConfigService);
    redis = service.redis;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('should return true when value is "true"', async () => {
      redis.get.mockResolvedValue('true');

      const result = await service.isEnabled();

      expect(result).toBe(true);
    });

    it('should return false when value is not "true"', async () => {
      redis.get.mockResolvedValue('false');

      const result = await service.isEnabled();

      expect(result).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('should set enabled flag in Redis', async () => {
      await service.setEnabled(true);

      expect(redis.set).toHaveBeenCalledWith('collector:enabled', 'true');
    });

    it('should set disabled flag in Redis', async () => {
      await service.setEnabled(false);

      expect(redis.set).toHaveBeenCalledWith('collector:enabled', 'false');
    });
  });

  describe('getWindow', () => {
    it('should return parsed window hours', async () => {
      redis.get.mockImplementation((key: string) => {
        if (key === 'collector:start_hour') return '3';
        if (key === 'collector:end_hour') return '9';
        return null;
      });

      const result = await service.getWindow();

      expect(result).toEqual({ startHour: 3, endHour: 9 });
    });

    it('should return defaults when keys missing', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getWindow();

      expect(result).toEqual({ startHour: 1, endHour: 8 });
    });
  });

  describe('getLastRun', () => {
    it('should return last run timestamp', async () => {
      redis.get.mockResolvedValue('2026-01-01T00:00:00Z');

      const result = await service.getLastRun();

      expect(result).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('setLastRun', () => {
    it('should set last run timestamp', async () => {
      await service.setLastRun();

      expect(redis.set).toHaveBeenCalledWith('collector:last_run', expect.any(String));
    });
  });
});
