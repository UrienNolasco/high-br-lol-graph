import { Test, TestingModule } from '@nestjs/testing';
import { WorkerController } from './worker.controller';
import { WorkerService } from './worker.service';

describe('WorkerController', () => {
  let controller: WorkerController;

  const mockWorkerService = {
    processMatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerController],
      providers: [{ provide: WorkerService, useValue: mockWorkerService }],
    }).compile();

    controller = module.get<WorkerController>(WorkerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
