export type DataDragonCatalogStatus =
  | 'ok'
  | 'unsupported_version'
  | 'catalog_unavailable'
  | 'invalid_catalog';

/** Raw Data Dragon item fields. Validation belongs to the consuming adapter. */
export interface DataDragonItemRecord {
  name: unknown;
  image: unknown;
  from: unknown;
  into: unknown;
  tags: unknown;
  consumed: unknown;
  consumeOnFull: unknown;
}

/** Raw Data Dragon spell fields. Validation belongs to the consuming adapter. */
export interface DataDragonSkillRecord {
  id: unknown;
  name: unknown;
  maxrank: unknown;
}

export interface DataDragonItemCatalogSource {
  gameVersion: string;
  version: string | null;
  locale: 'pt_BR';
  policy: 'latest_revision_of_exact_patch';
  status: DataDragonCatalogStatus;
  items: Record<string, DataDragonItemRecord>;
}

export interface DataDragonSkillCatalogSource {
  gameVersion: string;
  version: string | null;
  championId: number;
  locale: 'pt_BR';
  policy: 'latest_revision_of_exact_patch';
  status: DataDragonCatalogStatus | 'unknown_champion_id';
  spells: DataDragonSkillRecord[];
}

/** Raw JSON from exact-version CDN paths; rune payloads have no version envelope. */
export interface DataDragonChoiceSource {
  gameVersion: string;
  version: string | null;
  status:
    | 'ok'
    | 'catalog_unavailable'
    | 'unsupported_version'
    | 'invalid_catalog';
  runes: unknown;
  summoners: unknown;
}
