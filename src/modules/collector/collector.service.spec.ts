import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CollectorService } from './collector.service';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import { PrismaService } from '../../core/prisma/prisma.service';

jest.mock('ioredis', () => {
  const mockRedisInstance = {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue('false'),
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);
  return { Redis: MockRedis, default: MockRedis };
});

describe('CollectorService', () => {
  let service: CollectorService;

  const mockRiotService = {
    getHighEloPuids: jest.fn(),
    getMatchIdsByPuuid: jest.fn(),
  };

  const mockQueueService = {
    publish: jest.fn(),
  };

  const mockPrismaService = {
    match: {
      findUnique: jest.fn(),
    },
  };

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
        CollectorService,
        { provide: RiotService, useValue: mockRiotService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CollectorService>(CollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
