import { WorkerService } from './worker.service';
import { PinoLogger } from 'nestjs-pino';

describe('WorkerService adapter', () => {
  it('delegates the transport payload and offline flag to processing', async () => {
    const processing = { processMatch: jest.fn().mockResolvedValue(undefined) };
    const service = new WorkerService(
      processing,
      { setContext: jest.fn() } as unknown as PinoLogger,
    );

    await service.processMatch({ matchId: 'BR1_1', traceId: 'trace' }, true);

    expect(processing.processMatch).toHaveBeenCalledWith(
      { matchId: 'BR1_1', traceId: 'trace' },
      true,
    );
  });
});
