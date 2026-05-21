import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CollectorConfigService } from './collector-config.service';
import { RedisService } from '../../../core/redis/redis.service';

describe('CollectorConfigService', () => {
  let service: CollectorConfigService;
  let mockRedisClient: Record<string, jest.Mock>;

  const mockRedisService = {
    get client() {
      return mockRedisClient;
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'COLLECTOR_ENABLED') return 'false';
      if (key === 'COLLECTOR_START_HOUR') return '1';
      if (key === 'COLLECTOR_END_HOUR') return '8';
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
    mockRedisClient = {
      on: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorConfigService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CollectorConfigService>(CollectorConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('should return true when value is "true"', async () => {
      mockRedisClient.get.mockResolvedValue('true');

      const result = await service.isEnabled();

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith('collector:enabled');
    });

    it('should return false when value is not "true"', async () => {
      mockRedisClient.get.mockResolvedValue('false');

      const result = await service.isEnabled();

      expect(result).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('should set enabled flag in Redis', async () => {
      await service.setEnabled(true);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'collector:enabled',
        'true',
      );
    });

    it('should set disabled flag in Redis', async () => {
      await service.setEnabled(false);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'collector:enabled',
        'false',
      );
    });
  });

  describe('getWindow', () => {
    it('should return parsed window hours', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'collector:start_hour') return '3';
        if (key === 'collector:end_hour') return '9';
        return null;
      });

      const result = await service.getWindow();

      expect(result).toEqual({ startHour: 3, endHour: 9 });
    });

    it('should return defaults when keys missing', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getWindow();

      expect(result).toEqual({ startHour: 1, endHour: 8 });
    });
  });

  describe('getLastRun', () => {
    it('should return last run timestamp', async () => {
      mockRedisClient.get.mockResolvedValue('2026-01-01T00:00:00Z');

      const result = await service.getLastRun();

      expect(result).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('setLastRun', () => {
    it('should set last run timestamp', async () => {
      await service.setLastRun();

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'collector:last_run',
        expect.any(String),
      );
    });
  });
});
