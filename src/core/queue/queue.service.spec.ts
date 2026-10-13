import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { connect, type ChannelWrapper } from 'amqp-connection-manager';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { PROCESSING_JOBS, type ProcessingJobs } from './processing-jobs';
import { QueueModule } from './queue.module';
import { QueueService } from './queue.service';

jest.mock('amqp-connection-manager', () => ({ connect: jest.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const jobs = {
  enqueue: jest.fn(),
  recoverExpired: jest.fn(),
  duePublications: jest.fn(),
  markPublished: jest.fn(),
  oldestPendingAgeMs: jest.fn(),
} satisfies Record<keyof ProcessingJobs, jest.Mock>;
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};
const config = { get: jest.fn() };
@Global()
@Module({
  providers: [
    { provide: PROCESSING_JOBS, useValue: jobs },
    { provide: PinoLogger, useValue: logger },
    { provide: ConfigService, useValue: config },
  ],
  exports: [PROCESSING_JOBS, PinoLogger, ConfigService],
})
class DependenciesModule {}

describe('Queue recovery lifecycle', () => {
  const previousMode = process.env.APP_MODE;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.APP_MODE = 'WORKER';
    jobs.recoverExpired.mockResolvedValue(undefined);
    jobs.duePublications.mockResolvedValue([
      { matchId: 'first', priority: 1, traceId: null },
      { matchId: 'second', priority: 1, traceId: null },
    ]);
    jobs.markPublished.mockResolvedValue(undefined);
    jobs.oldestPendingAgeMs.mockResolvedValue(0);
  });
  afterEach(() => {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  });

  it('drains the current publication and leaves the rest for durable recovery', async () => {
    const started = deferred(),
      published = deferred();
    const channel = {
      sendToQueue: jest.fn().mockImplementation(() => {
        started.resolve();
        return published.promise;
      }),
    };
    const queue = new QueueService(
      channel as unknown as ChannelWrapper,
      logger as unknown as PinoLogger,
      jobs,
    );
    const recovery = queue.recover();
    await started.promise;
    await queue.recover(); // A concurrent scheduler tick must not duplicate the batch.
    let closed = false;
    const closing = queue.onModuleDestroy().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    published.resolve();
    await Promise.all([recovery, closing]);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    expect(jobs.markPublished).toHaveBeenCalledWith('first', expect.any(Date));
    await queue.recover();
    expect(jobs.recoverExpired).toHaveBeenCalledTimes(1);
  });

  it('releases recovery ownership after a failed scan', async () => {
    const channel = { sendToQueue: jest.fn().mockResolvedValue(undefined) };
    const queue = new QueueService(
      channel as unknown as ChannelWrapper,
      logger as unknown as PinoLogger,
      jobs,
    );
    jobs.duePublications.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await queue.recover();
    await queue.recover();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(2);
    await queue.onModuleDestroy();
  });

  it('Nest waits for publication before destroying Prisma and closing RabbitMQ', async () => {
    const started = deferred(),
      published = deferred(),
      order: string[] = [];
    const channel = {
      on: jest.fn(),
      sendToQueue: jest.fn().mockImplementation(() => {
        started.resolve();
        return published.promise;
      }),
    };
    const connection = {
      on: jest.fn(),
      createChannel: jest.fn().mockReturnValue(channel),
      close: jest.fn().mockImplementation(() => {
        order.push('rabbit');
        return Promise.resolve();
      }),
    };
    (connect as jest.Mock).mockReturnValue(connection);
    jobs.markPublished.mockImplementation(() => {
      order.push('published');
      return Promise.resolve();
    });
    const database = {
      onModuleDestroy: jest.fn().mockImplementation(() => {
        order.push('database');
        return Promise.resolve();
      }),
    };
    const module = await Test.createTestingModule({
      imports: [DependenciesModule, QueueModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .compile();
    await module.init();
    const recovery = module.get(QueueService).recover();
    await started.promise;
    const closing = module.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(connection.close).not.toHaveBeenCalled();
    expect(database.onModuleDestroy).not.toHaveBeenCalled();
    published.resolve();
    await Promise.all([recovery, closing]);
    expect(order).toEqual(['published', 'database', 'rabbit']);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
  });
});
