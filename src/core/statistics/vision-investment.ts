/** Reviewed source fragment, not a live/current-price fallback. Numeric catalog facts only. */
export const CONTROL_WARD_CATALOG_EVIDENCE = {
  patch: '16.2',
  catalogVersion: '16.2.1',
  itemId: 2055,
  mapId: 11,
  purchasable: true,
  listPriceGold: 75,
  source: 'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/en_US/item.json',
  checkedOn: '2026-09-23',
} as const;
export const SUPPORT_QUEST_COST_EVIDENCE = {
  publicPatch: '26.1',
  afterQuestGold: 40,
  source:
    'https://www.leagueoflegends.com/en-sg/news/game-updates/patch-26-1-notes/',
  interpretation:
    'Documents conditional price; public patch label is not inferred from internal gameVersion, and quest state at purchase is not proven by final role/inventory.',
} as const;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function finalVisionField(projection: unknown, field: string) {
  const source = record(projection);
  if (source.projectionVersion !== 1)
    return { value: null, reason: 'unsupported_final_stats_projection' };
  const value = record(source.values)[field];
  const valid =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    (field === 'visionScore' || Number.isSafeInteger(value));
  return valid
    ? { value: value, reason: null }
    : {
        value: null,
        reason:
          (value !== null && value !== undefined) ||
          record(source.missingReasons)[field] === 'invalid_value'
            ? 'invalid_value'
            : 'missing_field',
      };
}
export function visionInvestmentContext(
  projection: unknown,
  patch: string,
  mapId: number,
) {
  const catalog =
    patch === CONTROL_WARD_CATALOG_EVIDENCE.patch && mapId === 11
      ? CONTROL_WARD_CATALOG_EVIDENCE
      : null;
  return {
    definitionVersion: 1,
    source: 'MatchParticipant.finalStats projectionVersion1',
    controlWardsBought: finalVisionField(projection, 'visionWardsBoughtInGame'),
    controlWardsPlaced: finalVisionField(projection, 'detectorWardsPlaced'),
    visionScore: finalVisionField(projection, 'visionScore'),
    goldSpent: {
      value: null,
      unit: 'gold',
      origin: 'unavailable',
      reason: catalog
        ? 'missing_validated_purchase_context'
        : 'unsupported_cost_catalog',
      catalog,
      conditionalRuleEvidence: SUPPORT_QUEST_COST_EVIDENCE,
      requiredEvidence: [
        'validated exact-patch purchase-price rule',
        'quest state and eligibility at each purchase',
        'purchase/undo accounting',
      ],
      method:
        'Do not multiply final purchase count or placements by list price; no currentGold/goldSpent balance proxy.',
    },
  };
}
