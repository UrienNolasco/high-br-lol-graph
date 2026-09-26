import { Injectable } from '@nestjs/common';
import {
  DataDragonItemCatalogSource,
  DataDragonItemRecord,
  DataDragonSkillCatalogSource,
  DataDragonSkillRecord,
} from '../../../../core/data-dragon/catalog-source';
import { DataDragonService } from '../../../../core/data-dragon/data-dragon.service';
import {
  ItemCatalog,
  ItemMetadata,
  SkillCatalog,
  SkillMetadata,
  unavailableItemCatalog,
  unavailableSkillCatalog,
} from '../../contracts/catalogs';
import type {
  CatalogReader,
  ItemCatalogLoader,
} from '../../ports/catalog-reader';
import { compatibleItemVersion } from '../../../../core/data-dragon/catalog-version';

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const ids = (value: unknown): number[] | null =>
  Array.isArray(value) &&
  value.every(
    (id) =>
      typeof id === 'string' &&
      /^[1-9]\d*$/.test(id) &&
      Number.isSafeInteger(Number(id)),
  )
    ? value.map(Number)
    : null;

function mapReason(status: DataDragonItemCatalogSource['status']) {
  return status === 'ok' ? null : status;
}

function mapItemRecord(
  source: DataDragonItemRecord,
  version: string | null,
): ItemMetadata | null {
  if (typeof source.name !== 'string') return null;
  const image = record(source.image)?.full;
  return {
    name: source.name,
    imageUrl:
      version && typeof image === 'string' && /^[\w.-]+\.png$/.test(image)
        ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${image}`
        : null,
    ...itemProgressionMetadata({
      from: source.from,
      into: source.into,
      tags: source.tags,
      consumed: source.consumed,
      consumeOnFull: source.consumeOnFull,
    }),
  };
}

/** Converts raw item fields into the optional metadata consumed by progression. */
export function itemProgressionMetadata(
  raw: Record<string, unknown>,
): Pick<ItemMetadata, 'from' | 'into' | 'tags' | 'consumed' | 'consumeOnFull'> {
  const ids = (value: unknown): number[] | null =>
    Array.isArray(value) &&
    value.every(
      (id) =>
        typeof id === 'string' &&
        /^[1-9]\d*$/.test(id) &&
        Number.isSafeInteger(Number(id)),
    )
      ? value.map(Number)
      : null;
  return {
    from: ids(raw.from),
    into: ids(raw.into),
    tags:
      Array.isArray(raw.tags) &&
      raw.tags.every((tag) => typeof tag === 'string')
        ? raw.tags
        : null,
    consumed: typeof raw.consumed === 'boolean' ? raw.consumed : null,
    consumeOnFull:
      typeof raw.consumeOnFull === 'boolean' ? raw.consumeOnFull : null,
  };
}

export function mapItemCatalog(
  source: DataDragonItemCatalogSource,
): ItemCatalog {
  if (source.status !== 'ok')
    return unavailableItemCatalog(source.gameVersion, mapReason(source.status));
  const items = Object.fromEntries(
    Object.entries(source.items).flatMap(([id, raw]) => {
      const item = mapItemRecord(raw, source.version);
      return item ? [[id, item]] : [];
    }),
  );
  return {
    gameVersion: source.gameVersion,
    version: source.version,
    locale: source.locale,
    policy: source.policy,
    reason: null,
    items,
  };
}

function mapSkillRecord(
  source: DataDragonSkillRecord & { id: string; name: string },
  slot: number,
): SkillMetadata {
  return {
    slot,
    spellId: source.id,
    name: source.name,
    maxRank:
      typeof source.maxrank === 'number' &&
      Number.isSafeInteger(source.maxrank) &&
      source.maxrank > 0
        ? source.maxrank
        : null,
  };
}

const catalogRecord = (value: unknown): Record<string, unknown> | null =>
  record(value);

/** Parses a champion detail payload at the integration boundary. */
export function parseSkillCatalog(
  gameVersion: string,
  version: string,
  championId: number,
  raw: unknown,
): SkillCatalog {
  const file = catalogRecord(raw);
  if (
    file?.version !== version ||
    compatibleItemVersion(gameVersion, [version]) !== version
  )
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  const data = catalogRecord(file.data);
  const champion = Object.values(data ?? {})
    .map(catalogRecord)
    .find((entry) => entry?.key === String(championId));
  if (!champion)
    return unavailableSkillCatalog(
      gameVersion,
      championId,
      'unknown_champion_id',
    );
  if (!Array.isArray(champion.spells) || champion.spells.length !== 4)
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  const spells = champion.spells.flatMap((rawSpell, index) => {
    const spell = record(rawSpell);
    return typeof spell?.id === 'string' && typeof spell.name === 'string'
      ? [
          mapSkillRecord(
            { id: spell.id, name: spell.name, maxrank: spell.maxrank },
            index + 1,
          ),
        ]
      : [];
  });
  if (spells.length !== 4)
    return unavailableSkillCatalog(gameVersion, championId, 'invalid_catalog');
  return {
    gameVersion,
    version,
    championId,
    locale: 'pt_BR',
    policy: 'latest_revision_of_exact_patch',
    reason: null,
    spells,
  };
}

export function mapSkillCatalog(
  source: DataDragonSkillCatalogSource,
): SkillCatalog {
  if (source.status !== 'ok')
    return unavailableSkillCatalog(
      source.gameVersion,
      source.championId,
      source.status,
    );
  const spells = source.spells.flatMap((spell, index) =>
    typeof spell.id === 'string' && typeof spell.name === 'string'
      ? [
          mapSkillRecord(
            { ...spell, id: spell.id, name: spell.name },
            index + 1,
          ),
        ]
      : [],
  );
  if (spells.length !== 4)
    return unavailableSkillCatalog(
      source.gameVersion,
      source.championId,
      'invalid_catalog',
    );
  return {
    gameVersion: source.gameVersion,
    version: source.version,
    championId: source.championId,
    locale: source.locale,
    policy: source.policy,
    reason: null,
    spells,
  };
}

@Injectable()
export class DataDragonCatalogAdapter
  implements CatalogReader, ItemCatalogLoader
{
  private readonly itemCache = new WeakMap<object, ItemCatalog>();
  private readonly skillCache = new WeakMap<object, SkillCatalog>();

  constructor(private readonly dataDragon: DataDragonService) {}

  private mapItem(source: DataDragonItemCatalogSource): ItemCatalog {
    const cached = this.itemCache.get(source);
    if (cached) return cached;
    const mapped = mapItemCatalog(source);
    this.itemCache.set(source, mapped);
    return mapped;
  }

  private mapSkill(source: DataDragonSkillCatalogSource): SkillCatalog {
    const cached = this.skillCache.get(source);
    if (cached) return cached;
    const mapped = mapSkillCatalog(source);
    this.skillCache.set(source, mapped);
    return mapped;
  }

  getCachedItemCatalog(gameVersion: string): ItemCatalog {
    return this.mapItem(
      this.dataDragon.getCachedItemCatalogSource(gameVersion),
    );
  }

  getCachedSkillCatalog(gameVersion: string, championId: number): SkillCatalog {
    return this.mapSkill(
      this.dataDragon.getCachedSkillCatalogSource(gameVersion, championId),
    );
  }

  async getItemCatalogForGameVersion(
    gameVersion: string,
  ): Promise<ItemCatalog> {
    return this.mapItem(
      await this.dataDragon.getItemCatalogSourceForGameVersion(gameVersion),
    );
  }

  async getSkillCatalogForGameVersion(
    gameVersion: string,
    championId: number,
  ): Promise<SkillCatalog> {
    return this.mapSkill(
      await this.dataDragon.getSkillCatalogSourceForGameVersion(
        gameVersion,
        championId,
      ),
    );
  }
}
