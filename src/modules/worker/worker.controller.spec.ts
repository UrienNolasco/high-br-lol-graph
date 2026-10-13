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

      expect(workerService.processMatch).toHaveBeenCalledWith({
        ...payload,
        traceId: expect.any(String),
      });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should NACK with requeue when durable recovery fails', async () => {
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

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, true);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });
  it('shares the execution limit across patterns and ACKs accepted work before shutdown', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    const service = {
      processMatch: jest
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue(undefined),
    };
    const previous = process.env.WORKER_CONCURRENCY;
    process.env.WORKER_CONCURRENCY = '1';
    const worker = new WorkerController(
      service as unknown as WorkerService,
      mockLogger as unknown as PinoLogger,
    );
    if (previous === undefined) delete process.env.WORKER_CONCURRENCY;
    else process.env.WORKER_CONCURRENCY = previous;
    const channel = {
      ack: jest.fn(),
      nack: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      once: jest.fn(),
    };
    const message = { ...mockMessage, fields: { consumerTag: 'consumer' } };
    const context = {
      getChannelRef: () => channel,
      getMessage: () => message,
    } as unknown as RmqContext;
    const first = worker.handleMatchCollect({ matchId: 'first' }, context);
    const second = worker.handleUserUpdate({ matchId: 'second' }, context);
    expect(service.processMatch).toHaveBeenCalledTimes(1);
    let closed = false;
    const closing = worker.onModuleDestroy().then(() => {
      closed = true;
    });
    expect(channel.cancel).toHaveBeenCalledWith('consumer');
    expect(channel.ack).not.toHaveBeenCalled();
    expect(closed).toBe(false);
    await expect(
      worker.handleMatchCollect({ matchId: 'late' }, context),
    ).rejects.toThrow('draining');
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    finish();
    await Promise.all([first, second, closing]);
    expect(service.processMatch).toHaveBeenCalledTimes(2);
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(closed).toBe(true);
    expect(channel.once).toHaveBeenCalledTimes(1);
  });
});
