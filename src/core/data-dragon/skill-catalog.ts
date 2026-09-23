import { compatibleItemVersion, ItemCatalog } from './item-catalog';
export interface SkillMetadata {
  slot: number;
  spellId: string;
  name: string;
  maxRank: number | null;
}
export interface SkillCatalog {
  gameVersion: string;
  version: string | null;
  championId: number;
  locale: 'pt_BR';
  policy: 'latest_revision_of_exact_patch';
  reason: ItemCatalog['reason'] | 'unknown_champion_id';
  spells: SkillMetadata[];
}
export const unavailableSkillCatalog = (
  gameVersion: string,
  championId: number,
  reason: SkillCatalog['reason'] = 'catalog_unavailable',
): SkillCatalog => ({
  gameVersion,
  championId,
  version: null,
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  reason,
  spells: [],
});
export const catalogRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function parseSkillCatalog(
  gameVersion: string,
  version: string,
  championId: number,
  raw: unknown,
): SkillCatalog {
  const file = catalogRecord(raw);
  if (
    file.version !== version ||
    compatibleItemVersion(gameVersion, [version]) !== version
  )
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  const champion = Object.values(catalogRecord(file.data))
    .map(catalogRecord)
    .find((entry) => entry.key === String(championId));
  if (!champion)
    return unavailableSkillCatalog(
      gameVersion,
      championId,
      'unknown_champion_id',
    );
  if (!Array.isArray(champion.spells) || champion.spells.length !== 4)
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  const spells = champion.spells.map((rawSpell, index) => {
    const s = catalogRecord(rawSpell);
    return {
      slot: index + 1,
      spellId: s.id,
      name: s.name,
      maxRank:
        typeof s.maxrank === 'number' &&
        Number.isSafeInteger(s.maxrank) &&
        s.maxrank > 0
          ? s.maxrank
          : null,
    };
  });
  if (
    spells.some(
      (s) => typeof s.spellId !== 'string' || typeof s.name !== 'string',
    )
  )
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  return {
    gameVersion,
    version,
    championId,
    locale: 'pt_BR',
    policy: 'latest_revision_of_exact_patch',
    reason: null,
    spells: spells as SkillMetadata[],
  };
}
