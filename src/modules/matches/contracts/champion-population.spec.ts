import {
  championPopulationEligibility,
  bansAvailable,
} from './champion-population';
describe('champion population eligibility', () => {
  const summary = {
    mapId: 11,
    queueId: 420,
    gameVersion: '16.2.741.3171',
    gameDuration: 1200,
    participants: Array.from({ length: 10 }, () => ({
      gameEndedInEarlySurrender: false,
      gameEndedInSurrender: true,
    })),
  };
  it('keeps ordinary surrender eligible, unsupported patches and unknown flags explicit', () => {
    expect(championPopulationEligibility(summary)).toEqual({
      populationEligible: true,
      populationExclusionReason: null,
    });
    expect(
      championPopulationEligibility({ ...summary, gameVersion: '16.20.1' }),
    ).toMatchObject({
      populationEligible: false,
      populationExclusionReason: 'unsupported_version',
    });
    expect(
      championPopulationEligibility({ ...summary, participants: [{}] }),
    ).toMatchObject({
      populationEligible: false,
      populationExclusionReason: 'unknown_remake',
    });
    expect(
      championPopulationEligibility({ ...summary, mapId: 12 })
        .populationExclusionReason,
    ).toBe('outside_cohort');
  });
  it('distinguishes an observed empty ban list from missing or malformed records', () => {
    expect(bansAvailable([])).toBe(true);
    expect(
      bansAvailable([{ championId: -1 }, { championId: 1 }, { championId: 1 }]),
    ).toBe(true);
    for (const missing of [
      undefined,
      null,
      {},
      [{ championId: '1' }],
      [null],
      [{ championId: -2 }],
    ])
      expect(bansAvailable(missing)).toBe(false);
  });
});
