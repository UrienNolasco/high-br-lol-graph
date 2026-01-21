import { Test, TestingModule } from '@nestjs/testing';
import { WorkerController } from './worker.controller';
import { WorkerService } from './worker.service';
import { RmqContext } from '@nestjs/microservices';
import type { Message } from 'amqplib';

describe('WorkerController', () => {
  let controller: WorkerController;
  let workerService: WorkerService;
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };
  let mockMessage: {
    fields: Record<string, unknown>;
    properties: Record<string, unknown>;
    content: Buffer;
  };

  const mockWorkerService = {
    processMatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerController],
      providers: [{ provide: WorkerService, useValue: mockWorkerService }],
    }).compile();

    controller = module.get<WorkerController>(WorkerController);
    workerService = module.get<WorkerService>(WorkerService);

    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockMessage = {
      fields: {},
      properties: {},
      content: Buffer.from(
        JSON.stringify({ matchId: 'match1', patch: '15.23' }),
      ),
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
      const payload = { matchId: 'BR1_1234567890', patch: '15.23' };
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

    it('should skip already processed match and ACK', async () => {
      const payload = { matchId: 'BR1_1234567890', patch: '15.23' };
      const context = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;

      mockWorkerService.processMatch.mockResolvedValue(undefined);

      await controller.handleMatchCollect(payload, context);

      expect(mockChannel.ack).toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should NACK without requeue on processing error', async () => {
      const payload = { matchId: 'BR1_1234567890', patch: '15.23' };
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

    it('should log match ID and patch when processing', async () => {
      const payload = { matchId: 'BR1_1234567890', patch: '15.23' };
      const context = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;

      mockWorkerService.processMatch.mockResolvedValue(undefined);

      await controller.handleMatchCollect(payload, context);

      expect(workerService.processMatch).toHaveBeenCalledWith({
        matchId: 'BR1_1234567890',
        patch: '15.23',
      });
    });

    it('should handle match with different patch', async () => {
      const payload = { matchId: 'BR1_9876543210', patch: '15.22' };
      const context = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;

      mockWorkerService.processMatch.mockResolvedValue(undefined);

      await controller.handleMatchCollect(payload, context);

      expect(workerService.processMatch).toHaveBeenCalledWith({
        matchId: 'BR1_9876543210',
        patch: '15.22',
      });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });
  });
});
