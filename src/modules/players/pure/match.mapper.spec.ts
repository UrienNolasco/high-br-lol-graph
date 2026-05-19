import {
  toPlayerMatchDto,
  buildMatchWhere,
  buildMatchOrderBy,
} from './match.mapper';
import { aMatchRow } from '../__fixtures__/player.fixture';

describe('match.mapper', () => {
  describe('toPlayerMatchDto', () => {
    it('should map a match row to DTO', () => {
      const row = aMatchRow() as any;
      const result = toPlayerMatchDto(row);

      expect(result.matchId).toBe('BR1_123456');
      expect(result.championId).toBe(1);
      expect(result.kills).toBe(5);
      expect(result.win).toBe(true);
      expect(result.gameDuration).toBe(1800);
    });

    it('should calculate cspm correctly', () => {
      const row = aMatchRow({
        csGraph: [0, 100, 200, 300],
        match: { gameCreation: BigInt(1), gameDuration: 1200, queueId: 420 },
      }) as any;
      const result = toPlayerMatchDto(row);
      expect(result.cspm).toBe(15.0);
    });

    it('should return 0 cspm for empty csGraph', () => {
      const row = aMatchRow({ csGraph: [] }) as any;
      const result = toPlayerMatchDto(row);
      expect(result.cspm).toBe(0);
    });
  });

  describe('buildMatchWhere', () => {
    it('should include queueId filter by default', () => {
      const where = buildMatchWhere('puuid', {} as any);
      expect(where.puuid).toBe('puuid');
      expect(where.match).toEqual({ queueId: 420 });
    });

    it('should add championId filter', () => {
      const where = buildMatchWhere('puuid', { championId: 1 } as any);
      expect(where.championId).toBe(1);
    });

    it('should add role filter', () => {
      const where = buildMatchWhere('puuid', { role: 'MID' } as any);
      expect(where.role).toBe('MID');
    });

    it('should add win filter for result=win', () => {
      const where = buildMatchWhere('puuid', { result: 'win' } as any);
      expect(where.win).toBe(true);
    });

    it('should add win filter for result=loss', () => {
      const where = buildMatchWhere('puuid', { result: 'loss' } as any);
      expect(where.win).toBe(false);
    });

    it('should add date range filter', () => {
      const where = buildMatchWhere('puuid', {
        startDate: 1000000,
        endDate: 2000000,
      } as any);
      const matchWhere = where.match as {
        gameCreation: { gte: bigint; lte: bigint };
      };
      expect(matchWhere.gameCreation).toEqual({
        gte: BigInt(1000000),
        lte: BigInt(2000000),
      });
    });

    it('should add cursor filter', () => {
      const where = buildMatchWhere('puuid', {} as any, BigInt(999));
      const matchWhere = where.match as { gameCreation: { lt: bigint } };
      expect(matchWhere.gameCreation).toEqual({ lt: BigInt(999) });
    });
  });

  describe('buildMatchOrderBy', () => {
    it('should default to gameCreation desc', () => {
      const order = buildMatchOrderBy();
      expect(order).toEqual({ match: { gameCreation: 'desc' } });
    });

    it('should order by kda for sortBy=kda', () => {
      const order = buildMatchOrderBy('kda');
      expect(order).toEqual({ kda: 'desc' });
    });

    it('should order by kills for sortBy=kills', () => {
      const order = buildMatchOrderBy('kills');
      expect(order).toEqual({ kills: 'desc' });
    });

    it('should order by damage for sortBy=damage', () => {
      const order = buildMatchOrderBy('damage');
      expect(order).toEqual({ totalDamage: 'desc' });
    });
  });
});
