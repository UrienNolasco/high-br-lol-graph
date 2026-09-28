import { indicatorWhere, IndicatorRepository } from './indicator.repository';
import { normalizeDatasetFilters } from '../dataset/contracts/query';
import { IndicatorQueryDto, parseIndicatorQuery } from './indicator-query.dto';
import {
  decodeIndicatorCursor,
  encodeIndicatorCursor,
} from './pure/indicator-cursor';
import { indicatorFixture } from '../../../test/fixtures/indicators';
describe('MET29 filtered bounded projection reads', () => {
  it('reuses cohort normalization including MID and exact patch boundaries', () => {
    const f = normalizeDatasetFilters({
      playerId: 'p',
      role: 'MID',
      patch: '16.2',
      championId: '114',
      queueId: '420',
      mapId: '11',
      fromMs: '100',
      toMs: '200',
    });
    expect(indicatorWhere(f)).toEqual({
      puuid: 'p',
      role: { in: ['MID', 'MIDDLE'] },
      championId: 114,
      match: {
        queueId: 420,
        mapId: 11,
        populationEligible: true,
        OR: [{ gameVersion: '16.2' }, { gameVersion: { startsWith: '16.2.' } }],
        gameCreation: { gte: 100n, lt: 200n },
      },
    });
  });
  it('reads one bounded ordered page and jobs in RepeatableRead with stable tie-break cursor', async () => {
    const input = indicatorFixture(),
      row = { ...input.participant, match: input.match };
    const tx = {
      matchParticipant: {
        count: jest.fn().mockResolvedValue(200),
        findMany: jest
          .fn()
          .mockResolvedValue([
            row,
            { ...row, match: { ...row.match, matchId: 'sentinel' } },
          ]),
      },
      matchProcessing: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { matchId: input.match.matchId, ...input.processing },
          ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const filters = normalizeDatasetFilters({
      playerId: input.participant.puuid,
    });
    const page = await new IndicatorRepository(prisma as any).history(
      filters,
      1,
      { gameCreation: 123n, matchId: 'cursor' },
    );
    expect(page).toMatchObject({ total: 200, truncated: true, hasMore: true });
    expect(page.inputs).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
    expect(tx.matchParticipant.findMany.mock.calls[0][0]).toMatchObject({
      take: 2,
      orderBy: [{ match: { gameCreation: 'desc' } }, { matchId: 'asc' }],
      where: {
        AND: [
          expect.anything(),
          {
            OR: [
              { match: { gameCreation: { lt: 123n } } },
              { match: { gameCreation: 123n }, matchId: { gt: 'cursor' } },
            ],
          },
        ],
      },
    });
    expect(
      tx.matchProcessing.findMany.mock.calls[0][0].where.matchId.in,
    ).toEqual([input.match.matchId]);
  });
  it('cursor roundtrips and rejects a changed cohort rather than silently changing population', () => {
    const f = normalizeDatasetFilters({
        playerId: 'p',
        role: 'MID',
        patch: '16.2',
      }),
      cursor = { gameCreation: 100n, matchId: 'm' };
    const encoded = encodeIndicatorCursor(cursor, f);
    expect(decodeIndicatorCursor(encoded, f)).toEqual(cursor);
    expect(() =>
      decodeIndicatorCursor(encoded, { ...f, patch: '16.3' }),
    ).toThrow();
    expect(() => decodeIndicatorCursor('!!', f)).toThrow();
  });
  it.each([
    { queueId: 2147483648 },
    { championId: 9007199254740991 },
    { limit: 101 },
    { limit: 0 },
    { limit: '1.2' },
    { groupLimit: 11 },
    { groupOffset: -1 },
    { evidenceLimit: 4 },
    { fromMs: 2, toMs: 1 },
    { queueId: '420x' },
    { role: 'NONE' },
    { patch: 'ALL' },
    { family: 'unknown' },
    { after: 'bad' },
    { injected: 1 },
  ])('rejects invalid query %j', (query) => {
    expect(() => parseIndicatorQuery(query as any, 'p')).toThrow();
  });
  it('keeps defaults when class-transformer creates optional properties with undefined values', () => {
    const query = new IndicatorQueryDto();
    query.family = 'casts';
    expect(parseIndicatorQuery(query, 'p')).toMatchObject({
      filters: { queueId: 420, mapId: 11, eligibleOnly: true, playerId: 'p' },
      options: { family: 'casts', limit: 30 },
    });
  });
  it('normalizes filters and keeps bounded independent source and group pages', () => {
    expect(
      parseIndicatorQuery(
        { role: 'MID', limit: 10, groupLimit: 2, groupOffset: 2 },
        'p',
      ),
    ).toMatchObject({
      filters: {
        role: 'MIDDLE',
        queueId: 420,
        mapId: 11,
        playerId: 'p',
        eligibleOnly: true,
      },
      options: { limit: 10, groupLimit: 2, groupOffset: 2, evidenceLimit: 3 },
    });
  });
});
