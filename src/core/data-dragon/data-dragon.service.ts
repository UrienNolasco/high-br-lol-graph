import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { compatibleItemVersion } from './catalog-version';
import {
  DataDragonItemCatalogSource,
  DataDragonItemRecord,
  DataDragonSkillCatalogSource,
  DataDragonSkillRecord,
} from './catalog-source';
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

interface ChampionData {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
}

interface ChampionsFile {
  type: string;
  format: string;
  version: string;
  data: {
    [key: string]: ChampionData;
  };
}

const unavailableItemCatalogSource = (
  gameVersion: string,
  status: DataDragonItemCatalogSource['status'] = 'catalog_unavailable',
): DataDragonItemCatalogSource => ({
  gameVersion,
  version: null,
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  status,
  items: {},
});

const unavailableSkillCatalogSource = (
  gameVersion: string,
  championId: number,
  status: DataDragonSkillCatalogSource['status'] = 'catalog_unavailable',
): DataDragonSkillCatalogSource => ({
  gameVersion,
  championId,
  version: null,
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  status,
  spells: [],
});

@Injectable()
export class DataDragonService implements OnModuleInit {
  private readonly logger = new Logger(DataDragonService.name);
  private readonly VERSIONS_URL =
    'https://ddragon.leagueoflegends.com/api/versions.json';

  private championsById: Map<number, ChampionData> = new Map();
  private championsByName: Map<string, ChampionData> = new Map();

  private cachedPatch: string | null = null;
  private patchCachePromise: Promise<string> | null = null;

  private cachedFullVersion: string | null = null;
  private fullVersionCachePromise: Promise<string> | null = null;
  private itemCatalogs = new Map<
    string,
    { expiresAt: number; catalog: DataDragonItemCatalogSource }
  >();
  private pendingItemCatalogs = new Map<
    string,
    Promise<DataDragonItemCatalogSource>
  >();

  constructor(private readonly httpService: HttpService) {}
  private readonly skillCatalogs = new Map<
    string,
    { expiresAt: number; catalog: DataDragonSkillCatalogSource }
  >();
  private readonly pendingSkillCatalogs = new Map<
    string,
    Promise<DataDragonSkillCatalogSource>
  >();
  /** Strictly network-free; report reads never warm the catalog. */
  getCachedSkillCatalogSource(
    gameVersion: string,
    championId: number,
  ): DataDragonSkillCatalogSource {
    const entry = this.skillCatalogs.get(`${gameVersion}:${championId}`);
    return entry && entry.expiresAt > Date.now()
      ? entry.catalog
      : unavailableSkillCatalogSource(gameVersion, championId);
  }
  /** Explicit preloading API for callers outside report GET paths. */
  async getSkillCatalogSourceForGameVersion(
    gameVersion: string,
    championId: number,
  ): Promise<DataDragonSkillCatalogSource> {
    const key = `${gameVersion}:${championId}`,
      cached = this.skillCatalogs.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;
    const pending = this.pendingSkillCatalogs.get(key);
    if (pending) return pending;
    const request = this.loadSkillCatalog(gameVersion, championId)
      .then((catalog) => {
        this.skillCatalogs.set(key, {
          catalog,
          expiresAt:
            Date.now() + (catalog.status === 'ok' ? 3_600_000 : 60_000),
        });
        return catalog;
      })
      .finally(() => this.pendingSkillCatalogs.delete(key));
    this.pendingSkillCatalogs.set(key, request);
    return request;
  }
  private async loadSkillCatalog(
    gameVersion: string,
    championId: number,
  ): Promise<DataDragonSkillCatalogSource> {
    try {
      const options = { timeout: 5000, maxContentLength: 5000000 };
      const versions = (
        await firstValueFrom(
          this.httpService.get<unknown>(this.VERSIONS_URL, options),
        )
      ).data;
      if (
        !Array.isArray(versions) ||
        !versions.every((v) => typeof v === 'string')
      )
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      const version = compatibleItemVersion(gameVersion, versions);
      if (!version)
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'unsupported_version',
        );
      const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR`;
      const index =
        record(
          (
            await firstValueFrom(
              this.httpService.get<unknown>(`${base}/champion.json`, options),
            )
          ).data,
        ) ?? {};
      if (index.version !== version)
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      const champion = Object.values(record(index?.data) ?? {})
        .map(record)
        .find(
          (p): p is Record<string, unknown> =>
            p !== null && p.key === String(championId),
        );
      if (
        !champion ||
        typeof champion.id !== 'string' ||
        !/^[A-Za-z0-9]+$/.test(champion.id)
      )
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'unknown_champion_id',
        );
      const raw = (
        await firstValueFrom(
          this.httpService.get<unknown>(
            `${base}/champion/${champion.id}.json`,
            options,
          ),
        )
      ).data;
      const file = record(raw);
      const data = record(file?.data);
      if (file?.version !== version)
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      const championDetail = Object.values(data ?? {})
        .map(record)
        .find(
          (entry): entry is Record<string, unknown> =>
            entry !== null && entry.key === String(championId),
        );
      if (!championDetail)
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'unknown_champion_id',
        );
      const spells = Array.isArray(championDetail?.spells)
        ? championDetail.spells.map((spell): DataDragonSkillRecord => {
            const value = record(spell);
            return {
              id: value?.id,
              name: value?.name,
              maxrank: value?.maxrank,
            };
          })
        : [];
      if (
        spells.length !== 4 ||
        spells.some(
          (spell) =>
            typeof spell.id !== 'string' || typeof spell.name !== 'string',
        )
      )
        return unavailableSkillCatalogSource(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      return {
        gameVersion,
        version,
        championId,
        locale: 'pt_BR',
        policy: 'latest_revision_of_exact_patch',
        status: 'ok',
        spells,
      };
    } catch {
      return unavailableSkillCatalogSource(gameVersion, championId);
    }
  }

  /** Network-free read for reports. Missing metadata must not block inventory. */
  getCachedItemCatalogSource(gameVersion: string): DataDragonItemCatalogSource {
    const entry = this.itemCatalogs.get(gameVersion);
    return entry && entry.expiresAt > Date.now()
      ? entry.catalog
      : unavailableItemCatalogSource(gameVersion);
  }

  /** Resolve within the match patch; never fall back to current/latest patch. */
  async getItemCatalogSourceForGameVersion(
    gameVersion: string,
  ): Promise<DataDragonItemCatalogSource> {
    const cached = this.itemCatalogs.get(gameVersion);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;
    const pending = this.pendingItemCatalogs.get(gameVersion);
    if (pending) return pending;
    const request = this.loadItemCatalog(gameVersion)
      .then((catalog) => {
        this.itemCatalogs.set(gameVersion, {
          catalog,
          expiresAt:
            Date.now() + (catalog.status === 'ok' ? 3_600_000 : 60_000),
        });
        return catalog;
      })
      .finally(() => this.pendingItemCatalogs.delete(gameVersion));
    this.pendingItemCatalogs.set(gameVersion, request);
    return request;
  }

  private async loadItemCatalog(
    gameVersion: string,
  ): Promise<DataDragonItemCatalogSource> {
    try {
      const options = { timeout: 5000, maxContentLength: 5_000_000 };
      const versions = (
        await firstValueFrom(
          this.httpService.get<unknown>(this.VERSIONS_URL, options),
        )
      ).data;
      if (
        !Array.isArray(versions) ||
        !versions.every((v) => typeof v === 'string')
      )
        return unavailableItemCatalogSource(gameVersion, 'invalid_catalog');
      const version = compatibleItemVersion(gameVersion, versions);
      if (!version)
        return unavailableItemCatalogSource(gameVersion, 'unsupported_version');
      const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/item.json`;
      const rawFile = (
        await firstValueFrom(this.httpService.get<unknown>(url, options))
      ).data;
      const file = record(rawFile);
      const data = record(file?.data);
      if (file?.version !== version || !data)
        return unavailableItemCatalogSource(gameVersion, 'invalid_catalog');
      const items = Object.fromEntries(
        Object.entries(data).flatMap(([id, rawValue]) => {
          const value = record(rawValue);
          if (!/^\d+$/.test(id) || typeof value?.name !== 'string') return [];
          const item: DataDragonItemRecord = {
            name: value.name,
            image: value.image,
            from: value.from,
            into: value.into,
            tags: value.tags,
            consumed: value.consumed,
            consumeOnFull: value.consumeOnFull,
          };
          return [[id, item] as const];
        }),
      );
      return {
        gameVersion,
        version,
        locale: 'pt_BR',
        policy: 'latest_revision_of_exact_patch',
        status: 'ok',
        items,
      };
    } catch {
      return unavailableItemCatalogSource(gameVersion);
    }
  }

  onModuleInit() {
    this.loadChampionData();
  }

  private loadChampionData() {
    try {
      const filePath = path.join(process.cwd(), 'champions.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData: ChampionsFile = JSON.parse(fileContent) as ChampionsFile;

      const champions = jsonData.data;

      for (const championKey in champions) {
        const champion = champions[championKey];
        const championId = parseInt(champion.key, 10);

        this.championsById.set(championId, champion);
        this.championsByName.set(
          champion.name.toLowerCase().replace(/\s/g, ''),
          champion,
        );
      }

      this.logger.log(
        `Carregados ${this.championsById.size} campeões do Data Dragon.`,
      );
    } catch (error) {
      this.logger.error('Falha ao carregar o arquivo champions.json', error);
    }
  }

  public getChampionById(id: number): ChampionData | undefined {
    return this.championsById.get(id);
  }

  public getChampionByName(name: string): ChampionData | undefined {
    const normalizedName = name.toLowerCase().replace(/\s/g, '');
    return this.championsByName.get(normalizedName);
  }

  public getAllChampions(): ChampionData[] {
    return Array.from(this.championsById.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Busca todas as versões disponíveis do League of Legends da API do Data Dragon.
   * @returns Array de strings com todas as versões, ordenadas da mais recente para a mais antiga
   */
  public async getVersions(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<string[]>(this.VERSIONS_URL),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Falha ao buscar versões do Data Dragon', error);
      throw new Error('Não foi possível buscar as versões do Data Dragon');
    }
  }

  /**
   * Retorna o patch atual do League of Legends no formato simplificado (ex: 15.23).
   * Remove o terceiro número da versão (ex: 15.23.1 -> 15.23)
   * Usa cache para evitar múltiplas chamadas à API
   * @returns String com o patch atual no formato X.Y
   */
  public async getCurrentPatch(): Promise<string> {
    if (this.cachedPatch) {
      return this.cachedPatch;
    }

    if (this.patchCachePromise) {
      return this.patchCachePromise;
    }

    this.patchCachePromise = (async () => {
      try {
        const versions = await this.getVersions();

        if (!versions || versions.length === 0) {
          throw new Error('Nenhuma versão encontrada');
        }

        const latestVersion = versions[0];

        const patchParts = latestVersion.split('.');
        let patch: string;
        if (patchParts.length >= 2) {
          patch = `${patchParts[0]}.${patchParts[1]}`;
        } else {
          patch = latestVersion;
        }

        this.cachedPatch = patch;
        this.patchCachePromise = null;
        return patch;
      } catch (error) {
        this.patchCachePromise = null;
        throw error;
      }
    })();

    return this.patchCachePromise;
  }

  /**
   * Retorna a versão completa atual do League of Legends (ex: 15.23.1).
   * Usa cache para evitar múltiplas chamadas à API
   * @returns String com a versão completa (ex: "15.23.1")
   */
  public async getCurrentFullVersion(): Promise<string> {
    if (this.cachedFullVersion) {
      return this.cachedFullVersion;
    }

    if (this.fullVersionCachePromise) {
      return this.fullVersionCachePromise;
    }

    this.fullVersionCachePromise = (async () => {
      try {
        const versions = await this.getVersions();

        if (!versions || versions.length === 0) {
          throw new Error('Nenhuma versão encontrada');
        }

        const fullVersion = versions[0];

        this.cachedFullVersion = fullVersion;
        this.fullVersionCachePromise = null;
        return fullVersion;
      } catch (error) {
        this.fullVersionCachePromise = null;
        throw error;
      }
    })();

    return this.fullVersionCachePromise;
  }

  /**
   * Gera as URLs das imagens do campeão (square, loading, splash) do CDN do Data Dragon.
   * @param championIdString ID do campeão no formato string do Data Dragon (ex: "MonkeyKing", "LeBlanc")
   * @param version Versão completa do patch (ex: "15.23.1"). Se não fornecido, usa a versão completa atual via cache.
   * @returns Objeto com as URLs das imagens
   */
  public async getChampionImageUrls(
    championIdString: string,
    version?: string,
  ): Promise<{ square: string; loading: string; splash: string }> {
    const fullVersion = version || (await this.getCurrentFullVersion());

    const square = `https://ddragon.leagueoflegends.com/cdn/${fullVersion}/img/champion/${championIdString}.png`;
    const loading = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championIdString}_0.jpg`;
    const splash = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championIdString}_0.jpg`;

    return {
      square,
      loading,
      splash,
    };
  }
}
