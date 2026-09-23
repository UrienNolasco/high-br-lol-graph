import { CombatRepository, COMBAT_EVENT_FILTER } from './combat.repository';
import { combatFixture } from '../pure/combat.fixture';
describe('MET13 projection-only repository', () => {
  it('reads final summary, selected event projections and generation in one repeatable read transaction', async () => {
    const input = combatFixture();
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue(input) },
      matchEventProjection: {
        findMany: jest.fn().mockResolvedValue(input.events),
      },
      matchProcessing: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'COMPLETED',
          processingVersion: 3,
          completedAt: new Date(input.processedAt),
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const result = await new CombatRepository(prisma as any).findMatchCombat(
      'm',
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.matchEventProjection.findMany).toHaveBeenCalledWith({
      where: { matchId: 'm', ...COMBAT_EVENT_FILTER },
      orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
    });
    expect(result?.input).toMatchObject({
      projectionComplete: true,
      processingVersion: 3,
    });
  });
  it('returns null for an unknown match before querying event rows', async () => {
    const tx = { match: { findUnique: jest.fn().mockResolvedValue(null) } };
    expect(
      await new CombatRepository({
        $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
      } as any).findMatchCombat('missing'),
    ).toBeNull();
  });
});
