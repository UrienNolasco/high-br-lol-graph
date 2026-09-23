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

  describe('findParticipantsBuilds', () => {
    it('should query builds data', async () => {
      await repo.findParticipantsBuilds('BR1_1');

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
        where: { matchId: 'BR1_1' },
        select: {
          puuid: true,
          championId: true,
          championName: true,
          itemTimeline: true,
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
