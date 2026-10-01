import type { ChoiceCatalog } from '../contracts/choice-catalog';
import type { ItemCatalog } from '../contracts/catalogs';
export interface ChoiceCatalogReader {
  getChoiceCatalog(gameVersion: string): Promise<ChoiceCatalog>;
  getItemCatalog(gameVersion: string): Promise<ItemCatalog>;
}
export const CHOICE_CATALOG_READER = Symbol('CHOICE_CATALOG_READER');
