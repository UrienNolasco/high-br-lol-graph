import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
  const mockRedisInstance = {
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  return { Redis: MockRedis, default: MockRedis };
});

describe('RedisService', () => {
  let service: RedisService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string | number) => {
      if (key === 'REDIS_HOST') return 'my-redis';
      if (key === 'REDIS_PORT') return 1234;
      return defaultValue;
    }),
  };

  const mockLogger = {
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create Redis client with config values', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_HOST', 'redis');
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_PORT', 6379);
  });

  it('should expose client getter', () => {
    const client = service.client;

    expect(client).toBeDefined();
    expect(client.on).toBeDefined();
    expect(client.quit).toBeDefined();
  });

  it('should attach connect and error listeners', () => {
    const { Redis: MockRedis } = jest.requireMock('ioredis');
    const redisInstance = MockRedis.mock.results[0].value as { on: jest.Mock };

    expect(redisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(redisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should quit Redis on module destroy', async () => {
    await service.onModuleDestroy();

    const client = service.client as { quit: jest.Mock };
    expect(client.quit).toHaveBeenCalled();
  });
});
