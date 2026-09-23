import { finalVisionField, visionInvestmentContext } from './vision-investment';
describe('MET20 V08 validated vision context', () => {
  const projection = {
    projectionVersion: 1,
    values: {
      visionScore: null,
      visionWardsBoughtInGame: 3,
      detectorWardsPlaced: 2,
    },
    missingReasons: { visionScore: 'missing_field' },
  };
  it('preserves independently observed counters when vision score is absent', () => {
    expect(visionInvestmentContext(projection, '16.2', 11)).toMatchObject({
      controlWardsBought: { value: 3 },
      controlWardsPlaced: { value: 2 },
      visionScore: { value: null, reason: 'missing_field' },
    });
  });
  it('never multiplies counters by list price or inferred support-quest price', () => {
    const result = visionInvestmentContext(projection, '16.2', 11);
    expect(result.goldSpent).toMatchObject({
      value: null,
      reason: 'missing_validated_purchase_context',
      catalog: { catalogVersion: '16.2.1', listPriceGold: 75 },
      conditionalRuleEvidence: { afterQuestGold: 40 },
    });
    expect(
      visionInvestmentContext(
        { ...projection, values: { visionWardsBoughtInGame: 0 } },
        '16.2',
        11,
      ).goldSpent.value,
    ).toBeNull();
  });
  it.each([
    ['16.20', 11],
    ['16.2', 12],
  ])('does not apply reviewed catalog to %s/map%s', (patch, map) =>
    expect(
      visionInvestmentContext(projection, String(patch), Number(map)).goldSpent,
    ).toMatchObject({ catalog: null, reason: 'unsupported_cost_catalog' }),
  );
  it('distinguishes zero, absent/invalid field and unsupported projection', () => {
    expect(
      finalVisionField(
        { projectionVersion: 1, values: { visionScore: 0 } },
        'visionScore',
      ),
    ).toEqual({ value: 0, reason: null });
    expect(
      finalVisionField(
        { projectionVersion: 99, values: { visionScore: 8 } },
        'visionScore',
      ).value,
    ).toBeNull();
    expect(
      finalVisionField(
        {
          projectionVersion: 1,
          values: { visionScore: Infinity },
          missingReasons: { visionScore: 'invalid_value' },
        },
        'visionScore',
      ),
    ).toEqual({ value: null, reason: 'invalid_value' });
  });
});
