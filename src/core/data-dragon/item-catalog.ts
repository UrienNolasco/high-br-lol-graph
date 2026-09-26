import { gameVersionPatch } from '../../modules/matches/contracts/eligibility';

export interface ItemMetadata {
  name: string;
  imageUrl: string | null;
  from?: number[] | null;
  into?: number[] | null;
  tags?: string[] | null;
  consumed?: boolean | null;
  consumeOnFull?: boolean | null;
}
export interface ItemCatalog {
  gameVersion: string;
  version: string | null;
  locale: 'pt_BR';
  policy: 'latest_revision_of_exact_patch';
  reason:
    | 'unsupported_version'
    | 'catalog_unavailable'
    | 'invalid_catalog'
    | null;
  items: Record<string, ItemMetadata>;
}

/** Internal major.minor, never current patch or an inferred public patch number. */
export function compatibleItemVersion(
  gameVersion: string,
  versions: readonly string[],
): string | null {
  const patch = gameVersionPatch(gameVersion);
  if (!patch) return null;
  return (
    versions
      .filter(
        (version) =>
          /^\d+\.\d+\.\d+$/.test(version) &&
          gameVersionPatch(version) === patch,
      )
      .sort((a, b) => Number(b.split('.')[2]) - Number(a.split('.')[2]))[0] ??
    null
  );
}

export function unavailableItemCatalog(
  gameVersion: string,
  reason: ItemCatalog['reason'] = 'catalog_unavailable',
): ItemCatalog {
  return {
    gameVersion,
    version: null,
    locale: 'pt_BR',
    policy: 'latest_revision_of_exact_patch',
    reason,
    items: {},
  };
}

/** Missing recipe is unknown, not an empty recipe or proof of a completed item. */
export function itemProgressionMetadata(
  raw: Record<string, unknown>,
): Pick<ItemMetadata, 'from' | 'into' | 'tags' | 'consumed' | 'consumeOnFull'> {
  const ids = (v: unknown): number[] | null =>
    Array.isArray(v) &&
    v.every(
      (id) =>
        typeof id === 'string' &&
        /^[1-9]\d*$/.test(id) &&
        Number.isSafeInteger(Number(id)),
    )
      ? v.map(Number)
      : null;
  return {
    from: ids(raw.from),
    into: ids(raw.into),
    tags:
      Array.isArray(raw.tags) && raw.tags.every((t) => typeof t === 'string')
        ? raw.tags
        : null,
    consumed: typeof raw.consumed === 'boolean' ? raw.consumed : null,
    consumeOnFull:
      typeof raw.consumeOnFull === 'boolean' ? raw.consumeOnFull : null,
  };
}
