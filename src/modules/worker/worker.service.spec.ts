import { Test, TestingModule } from '@nestjs/testing';
import { WorkerService } from './worker.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RiotService } from '../../core/riot/riot.service';
import { MatchParserService } from '../../core/riot/match-parser.service';

describe('WorkerService', () => {
  let service: WorkerService;

  const mockPrismaService = {
    processedMatch: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    championStats: {
      upsert: jest.fn(),
    },
    matchupStats: {
      upsert: jest.fn(),
    },
  };

  const mockRiotService = {
    getMatchById: jest.fn(),
  };

  const mockMatchParserService = {
    parseMatchData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RiotService, useValue: mockRiotService },
        { provide: MatchParserService, useValue: mockMatchParserService },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
