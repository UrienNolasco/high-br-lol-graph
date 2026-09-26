import { selectCohort } from './cohort';
import { gameVersionPatch } from '../../matches/contracts/eligibility';

describe('cohort eligibility', () => {
  it('selects one deterministic distinct-match cohort with exact patch and half-open period', () => {
    const base = {
      region: 'BR',
      queueId: 420,
      mapId: 11,
      gameVersion: null,
      patch: '16.2',
      championId: 1,
      role: 'MIDDLE' as const,
      collectionSource: null,
      gameCreation: 50,
    };
    const filter = {
      dimensions: { patch: '16.2', collectionSource: null },
      fromMs: 0,
      toMs: 100,
    };
    const selected = selectCohort(
      [
        { ...base, matchId: 'b' },
        { ...base, matchId: 'a' },
        { ...base, matchId: 'a' },
        { ...base, matchId: 'c', patch: '16.20' },
        { ...base, matchId: 'd', gameCreation: 100 },
      ],
      filter,
      1,
    );
    expect(selected).toMatchObject({
      eligibleN: 2,
      returnedN: 1,
      truncated: true,
      matches: [{ matchId: 'a' }],
    });
    expect(gameVersionPatch('16.20.123')).toBe('16.20');
    expect(gameVersionPatch('26.x')).toBeNull();
  });
});
