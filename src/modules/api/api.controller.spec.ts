import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitController } from './api.controller';

describe('RateLimitController', () => {
  let controller: RateLimitController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RateLimitController],
    }).compile();

    controller = module.get<RateLimitController>(RateLimitController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
