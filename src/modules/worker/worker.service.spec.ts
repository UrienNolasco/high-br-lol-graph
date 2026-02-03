import { Test, TestingModule } from '@nestjs/testing';
import { WorkerService } from './worker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RiotService } from '../../core/riot/riot.service';
import { TimelineParserService } from '../../core/riot/timeline-parser.service';

describe('WorkerService', () => {
  let service: WorkerService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    match: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    matchTeam: {
      createMany: jest.fn(),
    },
    matchParticipant: {
      createMany: jest.fn(),
    },
    championStats: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockRiotService = {
    getMatchById: jest.fn(),
    getTimeline: jest.fn(),
  };

  const mockTimelineParserService = {
    parseTimeline: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RiotService, useValue: mockRiotService },
        { provide: TimelineParserService, useValue: mockTimelineParserService },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
