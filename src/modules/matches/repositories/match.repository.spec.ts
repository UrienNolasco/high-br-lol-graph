import { Test, TestingModule } from '@nestjs/testing';
import { MatchRepository } from './match.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('MatchRepository', () => {
  let repo: MatchRepository;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      match: { findUnique: jest.fn() },
      matchParticipant: { findMany: jest.fn() },
      matchTeam: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<MatchRepository>(MatchRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findMatchWithDetails', () => {
    it('should query match with teams and participants', async () => {
      const mock = { matchId: 'BR1_1', teams: [], participants: [] };
      (prisma.match.findUnique as jest.Mock).mockResolvedValue(mock);

      const result = await repo.findMatchWithDetails('BR1_1');

      expect(prisma.match.findUnique).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        include: { teams: true, participants: true },
      });
      expect(result).toBe(mock);
    });
  });

  describe('findGoldTimeline', () => {
    it('reads existence, outcome and gold in one match query', async () => {
      const mock = { teams: [{ teamId: 100, win: true }], participants: [] };
      (prisma.match.findUnique as jest.Mock).mockResolvedValue(mock);
      expect(await repo.findGoldTimeline('BR1_1')).toBe(mock);
      expect(prisma.match.findUnique).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: {
          mapId: true,
          gameVersion: true,
          teams: { select: { teamId: true, win: true } },
          participants: { select: { teamId: true, puuid: true } },
          timelineProjection: true,
        },
      });
    });
  });

  describe('findParticipantsEvents', () => {
    it('should query event positions', async () => {
      await repo.findParticipantsEvents('BR1_1');

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: {
          puuid: true,
          championId: true,
          killPositions: true,
          deathPositions: true,
          wardPositions: true,
        },
      });
    });
  });

  describe('findTeamsObjectives', () => {
    it('should query team objectives', async () => {
      await repo.findTeamsObjectives('BR1_1');

      expect(prisma.matchTeam.findMany).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: { teamId: true, objectivesTimeline: true },
      });
    });
  });

  describe('findBuilds', () => {
    it('reads final summary projection together with the original game version', async () => {
      await repo.findBuilds('BR1_1');
      expect(prisma.match.findUnique).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: {
          gameVersion: true,
          participants: {
            select: {
              puuid: true,
              championId: true,
              championName: true,
              itemTimeline: true,
              finalInventory: true,
            },
          },
        },
      });
    });
  });

  describe('findParticipantsForPerformance', () => {
    it('should include match gameDuration', async () => {
      await repo.findParticipantsForPerformance('BR1_1');

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        include: { match: { select: { gameDuration: true } } },
      });
    });
  });
});

describe('contribution projection query', () => {
  it('reads only final projection fields and actual completion metadata in one repeatable snapshot', async () => {
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue(null) },
      matchProcessing: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const database = { $transaction: jest.fn((callback) => callback(tx)) };
    const repo = new MatchRepository(database as any);
    expect(await repo.findContribution('BR1_1')).toEqual({
      match: null,
      processing: null,
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.match.findUnique).toHaveBeenCalledWith({
      where: { matchId: 'BR1_1' },
      select: {
        matchId: true,
        mapId: true,
        participants: {
          select: {
            puuid: true,
            teamId: true,
            championId: true,
            championName: true,
            role: true,
            kills: true,
            assists: true,
            finalStats: true,
          },
        },
      },
    });
    expect(tx.matchProcessing.findUnique).toHaveBeenCalledWith({
      where: { matchId: 'BR1_1' },
      select: { status: true, processingVersion: true, completedAt: true },
    });
  });
});
