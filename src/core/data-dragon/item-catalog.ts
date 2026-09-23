import { gameVersionPatch } from '../metrics';

export interface ItemMetadata {
  name: string;
  imageUrl: string | null;
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
