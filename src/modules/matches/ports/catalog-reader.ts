import type { ItemCatalog, SkillCatalog } from '../contracts/catalogs';

export interface CatalogReader {
  getCachedItemCatalog(gameVersion: string): ItemCatalog;
  getCachedSkillCatalog(gameVersion: string, championId: number): SkillCatalog;
}

export interface ItemCatalogLoader {
  getItemCatalogForGameVersion(gameVersion: string): Promise<ItemCatalog>;
}

export const MATCH_CATALOGS = Symbol('MATCH_CATALOGS');
