import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { WorkerController } from './worker.controller';
import { WorkerService } from './services/worker.service';
import { RmqContext } from '@nestjs/microservices';

describe('WorkerController', () => {
  let controller: WorkerController;
  let workerService: WorkerService;
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };
  let mockMessage: {
    fields: Record<string, unknown>;
    properties: Record<string, unknown>;
    content: Buffer;
  };

  const mockWorkerService = { processMatch: jest.fn() };
  const mockLogger = {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerController],
      providers: [
        { provide: WorkerService, useValue: mockWorkerService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    controller = module.get<WorkerController>(WorkerController);
    workerService = module.get<WorkerService>(WorkerService);

    mockChannel = { ack: jest.fn(), nack: jest.fn() };
    mockMessage = {
      fields: {},
      properties: {},
      content: Buffer.from(JSON.stringify({ matchId: 'match1' })),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleMatchCollect', () => {
    it('should process a match successfully and ACK', async () => {
      const payload = { matchId: 'BR1_1234567890' };
      const context = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;
      mockWorkerService.processMatch.mockResolvedValue(undefined);

      await controller.handleMatchCollect(payload, context);

      expect(workerService.processMatch).toHaveBeenCalledWith(payload);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should NACK without requeue on processing error', async () => {
      const payload = { matchId: 'BR1_1234567890' };
      const context = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;
      const error = new Error('Processing failed');
      mockWorkerService.processMatch.mockRejectedValue(error);

      await expect(
        controller.handleMatchCollect(payload, context),
      ).rejects.toThrow(error);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });
});
