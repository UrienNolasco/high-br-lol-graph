import { WorkerService } from './worker.service';
import { ProcessingService } from '../../../core/processing/processing.service';
import { MatchPersistenceService } from './match-persistence.service';
import { RiotService } from '../../../core/riot/riot.service';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { PinoLogger } from 'nestjs-pino';
import { MissingTimelineError } from '../../../core/processing/processing.constants';

describe('WorkerService durable recovery', () => {
  const lease = { matchId: 'BR1_1', leaseToken: 'owner', attempts: 1 };
  let service: WorkerService;
  let jobs: {
    enqueue: jest.Mock;
    claim: jest.Mock;
    readRaw: jest.Mock;
    saveRaw: jest.Mock;
    recordFailure: jest.Mock;
    renew: jest.Mock;
  };
  let riot: { getMatchById: jest.Mock; getTimeline: jest.Mock };
  let save: jest.Mock;
  beforeEach(() => {
    jobs = {
      enqueue: jest.fn(),
      claim: jest.fn().mockResolvedValue(lease),
      readRaw: jest.fn().mockResolvedValue(null),
      saveRaw: jest.fn(),
      recordFailure: jest.fn(),
      renew: jest.fn(),
    };
    riot = {
      getMatchById: jest
        .fn()
        .mockResolvedValue({ metadata: { matchId: 'BR1_1' } }),
      getTimeline: jest.fn().mockResolvedValue(null),
    };
    save = jest.fn();
    service = new WorkerService(
      riot as unknown as RiotService,
      new TimelineParserService(),
      { save } as unknown as MatchPersistenceService,
      jobs as unknown as ProcessingService,
      {
        setContext: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      } as unknown as PinoLogger,
    );
  });
  it('does not fetch or aggregate a completed/already claimed delivery', async () => {
    jobs.claim.mockResolvedValue(null);
    await service.processMatch({ matchId: 'BR1_1' });
    expect(riot.getMatchById).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('retains the summary and records a missing timeline for recovery', async () => {
    await service.processMatch({ matchId: 'BR1_1' });
    expect(jobs.saveRaw).toHaveBeenCalledWith(lease, 'summary', {
      metadata: { matchId: 'BR1_1' },
    });
    expect(jobs.recordFailure).toHaveBeenCalledWith(
      lease,
      expect.any(MissingTimelineError),
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('reuses stored summary on a later attempt', async () => {
    jobs.readRaw.mockImplementation((_id, field) => Promise.resolve(
      field === 'summary' ? { metadata: { matchId: 'BR1_1' } } : null,
    ));
    await service.processMatch({ matchId: 'BR1_1' });
    expect(riot.getMatchById).not.toHaveBeenCalled();
    expect(riot.getTimeline).toHaveBeenCalledWith('BR1_1');
  });
  it('propagates a failed recovery write so the broker delivery is not ACKed', async () => {
    jobs.recordFailure.mockRejectedValue(new Error('database unavailable'));
    await expect(service.processMatch({ matchId: 'BR1_1' })).rejects.toThrow(
      'database unavailable',
    );
  });
});
