export interface ChoiceMetadata {
  id: number;
  name: string;
}
export interface RuneStyleMetadata extends ChoiceMetadata {
  slots: number[][];
}
export interface ChoiceCatalog {
  gameVersion: string;
  version: string | null;
  policy: 'latest_revision_of_exact_patch';
  reason:
    | 'unsupported_version'
    | 'catalog_unavailable'
    | 'invalid_catalog'
    | null;
  runes: Record<string, ChoiceMetadata>;
  styles: Record<string, RuneStyleMetadata>;
  summoners: Record<string, ChoiceMetadata>;
}
export const unavailableChoiceCatalog = (
  gameVersion: string,
  reason: ChoiceCatalog['reason'] = 'catalog_unavailable',
): ChoiceCatalog => ({
  gameVersion,
  version: null,
  policy: 'latest_revision_of_exact_patch',
  reason,
  runes: {},
  styles: {},
  summoners: {},
});
