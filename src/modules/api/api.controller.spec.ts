import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitController, StatsController } from './api.controller';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import { ApiService } from './api.service';

describe('ApiControllers', () => {
  let rateLimitController: RateLimitController;
  let statsController: StatsController;

  const mockRateLimiterService = {
    getStatus: jest.fn(),
    clear: jest.fn(),
  };

  const mockApiService = {
    getChampionStats: jest.fn(),
    getChampion: jest.fn(),
    getMatchupStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RateLimitController, StatsController],
      providers: [
        { provide: RateLimiterService, useValue: mockRateLimiterService },
        { provide: ApiService, useValue: mockApiService },
      ],
    }).compile();

    rateLimitController = module.get<RateLimitController>(RateLimitController);
    statsController = module.get<StatsController>(StatsController);
  });

  it('should define RateLimitController', () => {
    expect(rateLimitController).toBeDefined();
  });

  it('should define StatsController', () => {
    expect(statsController).toBeDefined();
  });
});
