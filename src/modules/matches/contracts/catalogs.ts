export interface ItemMetadata {
  name: string;
  imageUrl: string | null;
  from?: number[] | null;
  into?: number[] | null;
  tags?: string[] | null;
  consumed?: boolean | null;
  consumeOnFull?: boolean | null;
}

export type CatalogReason =
  | 'unsupported_version'
  | 'catalog_unavailable'
  | 'invalid_catalog'
  | 'unknown_champion_id';

export interface ItemCatalog {
  gameVersion: string;
  version: string | null;
  locale: 'pt_BR';
  policy: 'latest_revision_of_exact_patch';
  reason: Exclude<CatalogReason, 'unknown_champion_id'> | null;
  items: Record<string, ItemMetadata>;
}

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
  reason: CatalogReason | null;
  spells: SkillMetadata[];
}

export const unavailableItemCatalog = (
  gameVersion: string,
  reason: ItemCatalog['reason'] = 'catalog_unavailable',
): ItemCatalog => ({
  gameVersion,
  version: null,
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  reason,
  items: {},
});

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
