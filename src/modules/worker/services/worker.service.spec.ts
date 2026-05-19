import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { WorkerService } from './worker.service';
import { RiotService } from '../../../core/riot/riot.service';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { MatchPersistenceService } from './match-persistence.service';
import { PlayerAggregatesUpdateService } from './player-aggregates-update.service';

describe('WorkerService', () => {
  let service: WorkerService;
  let persistence: jest.Mocked<
    Pick<MatchPersistenceService, 'exists' | 'save' | 'updateChampionStats'>
  >;
  let playerAggregates: jest.Mocked<
    Pick<PlayerAggregatesUpdateService, 'update'>
  >;
  let riotService: jest.Mocked<
    Pick<RiotService, 'getMatchById' | 'getTimeline'>
  >;
  let timelineParser: jest.Mocked<Pick<TimelineParserService, 'parseTimeline'>>;

  const mockMatchDto = {
    metadata: { matchId: 'BR1_1' },
    info: {
      gameCreation: 1700000000000,
      gameDuration: 1800,
      gameMode: 'CLASSIC',
      queueId: 420,
      gameVersion: '15.1.1',
      mapId: 11,
      teams: [
        { teamId: 100, win: true, bans: [{ championId: 1 }], objectives: {} },
      ],
      participants: [
        {
          puuid: 'p1',
          summonerName: 'Test',
          championId: 1,
          championName: 'Annie',
          teamId: 100,
          teamPosition: 'MIDDLE',
          lane: 'MIDDLE',
          individualPosition: 'MIDDLE',
          win: true,
          kills: 5,
          deaths: 3,
          assists: 10,
          goldEarned: 12000,
          totalDamageDealtToChampions: 25000,
          totalDamageTaken: 15000,
          visionScore: 30,
          perks: {},
          challenges: {},
          pings: {},
          summoner1Id: 4,
          summoner2Id: 14,
        },
      ],
    },
  } as any;

  beforeEach(async () => {
    persistence = {
      exists: jest.fn(),
      save: jest.fn(),
      updateChampionStats: jest.fn(),
    } as any;
    playerAggregates = { update: jest.fn() } as any;
    riotService = { getMatchById: jest.fn(), getTimeline: jest.fn() } as any;
    timelineParser = { parseTimeline: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        { provide: MatchPersistenceService, useValue: persistence },
        { provide: PlayerAggregatesUpdateService, useValue: playerAggregates },
        { provide: RiotService, useValue: riotService },
        { provide: TimelineParserService, useValue: timelineParser },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip if match already exists', async () => {
    persistence.exists.mockResolvedValue(true);

    await service.processMatch({ matchId: 'BR1_1' });

    expect(persistence.exists).toHaveBeenCalledWith('BR1_1');
    expect(riotService.getMatchById).not.toHaveBeenCalled();
  });

  it('should skip if no timeline available', async () => {
    persistence.exists.mockResolvedValue(false);
    riotService.getMatchById.mockResolvedValue(mockMatchDto);
    riotService.getTimeline.mockResolvedValue(null);

    await service.processMatch({ matchId: 'BR1_1' });

    expect(riotService.getTimeline).toHaveBeenCalledWith('BR1_1');
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('should process match with timeline successfully', async () => {
    persistence.exists.mockResolvedValue(false);
    riotService.getMatchById.mockResolvedValue(mockMatchDto);
    riotService.getTimeline.mockResolvedValue({
      metadata: { participants: ['p1'] },
      info: { frames: [] },
    } as any);
    timelineParser.parseTimeline.mockReturnValue({
      participants: new Map(),
    } as any);
    persistence.save.mockResolvedValue(undefined);
    persistence.updateChampionStats.mockResolvedValue(undefined);
    playerAggregates.update.mockResolvedValue(undefined);

    await service.processMatch({ matchId: 'BR1_1' });

    expect(timelineParser.parseTimeline).toHaveBeenCalled();
    expect(persistence.save).toHaveBeenCalled();
    expect(persistence.updateChampionStats).toHaveBeenCalled();
    expect(playerAggregates.update).toHaveBeenCalled();
  });
});
