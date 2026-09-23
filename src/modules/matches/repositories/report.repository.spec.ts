import { ReportRepository, REPORT_READ_LIMITS } from './report.repository';
describe('MET17 one consistent bounded projection snapshot', () => {
  it('uses RepeatableRead, deterministic event order, capped rows and explicit frame/event overflow', async () => {
    const match = {
      participants: [{ puuid: 'a' }],
      timelineProjection: { frames: Array(301).fill({}) },
    };
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue(match) },
      matchEventProjection: {
        findMany: jest.fn().mockResolvedValue(Array(10001).fill({})),
      },
      matchProcessing: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const value = await new ReportRepository(prisma as any).findReport(
      'm',
      'a',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.matchEventProjection.findMany).toHaveBeenCalledWith({
      where: { matchId: 'm' },
      orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
      take: REPORT_READ_LIMITS.events + 1,
    });
    expect(value!.events).toHaveLength(10000);
    expect(value!.readLimits).toEqual({
      eventLimit: 10000,
      eventRows: 10001,
      eventsTruncated: true,
      frameLimit: 300,
      frameRows: 301,
      framesTruncated: true,
    });
    expect(tx.match.findUnique.mock.calls[0][0].select).not.toHaveProperty(
      'raw',
    );
  });
  it('stops before timeline/event reads when the scoped participant is absent', async () => {
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue({ participants: [] }) },
    };
    const repo = new ReportRepository({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as any);
    expect(await repo.findReport('m', 'x')).toBeNull();
  });
});
