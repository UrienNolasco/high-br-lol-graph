import { combatInput } from './combat-source';
import { combatFixture } from './combat.fixture';
describe('MET13 processing provenance', () => {
  it.each([
    undefined,
    {
      matchId: 'm',
      status: 'PENDING',
      processingVersion: 2,
      completedAt: new Date(),
    },
    {
      matchId: 'm',
      status: 'COMPLETED',
      processingVersion: null,
      completedAt: new Date(),
    },
    {
      matchId: 'm',
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: null,
    },
    {
      matchId: 'm',
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('invalid'),
    },
  ])(
    'does not manufacture timestamp or generation for unavailable provenance %#',
    (source) => {
      const fixture = combatFixture();
      expect(combatInput(fixture, fixture.events, source)).toBeNull();
    },
  );
  it('preserves real generation and completion timestamp', () => {
    const fixture = combatFixture();
    expect(
      combatInput(fixture, fixture.events, {
        matchId: 'm',
        status: 'COMPLETED',
        processingVersion: 3,
        completedAt: new Date(fixture.processedAt),
      }),
    ).toMatchObject({ processingVersion: 3, processedAt: fixture.processedAt });
  });
});
