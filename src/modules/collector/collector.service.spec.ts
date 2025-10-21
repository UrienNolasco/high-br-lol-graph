import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from './collector.service';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import { PrismaService } from '../../core/prisma/prisma.service';

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
    processedMatch: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorService,
        { provide: RiotService, useValue: mockRiotService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CollectorService>(CollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
