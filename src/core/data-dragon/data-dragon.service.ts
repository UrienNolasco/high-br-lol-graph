import {
  SkillCatalog,
  unavailableSkillCatalog,
  parseSkillCatalog,
  catalogRecord,
} from './skill-catalog';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import {
  compatibleItemVersion,
  itemProgressionMetadata,
  ItemCatalog,
  unavailableItemCatalog,
} from './item-catalog';
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
    { expiresAt: number; catalog: ItemCatalog }
  >();
  private pendingItemCatalogs = new Map<string, Promise<ItemCatalog>>();

  constructor(private readonly httpService: HttpService) {}
  private readonly skillCatalogs = new Map<
    string,
    { expiresAt: number; catalog: SkillCatalog }
  >();
  private readonly pendingSkillCatalogs = new Map<
    string,
    Promise<SkillCatalog>
  >();
  /** Strictly network-free; report reads never warm the catalog. */
  getCachedSkillCatalog(gameVersion: string, championId: number): SkillCatalog {
    const entry = this.skillCatalogs.get(`${gameVersion}:${championId}`);
    return entry && entry.expiresAt > Date.now()
      ? entry.catalog
      : unavailableSkillCatalog(gameVersion, championId);
  }
  /** Explicit preloading API for callers outside report GET paths. */
  async getSkillCatalogForGameVersion(
    gameVersion: string,
    championId: number,
  ): Promise<SkillCatalog> {
    const key = `${gameVersion}:${championId}`,
      cached = this.skillCatalogs.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;
    const pending = this.pendingSkillCatalogs.get(key);
    if (pending) return pending;
    const request = this.loadSkillCatalog(gameVersion, championId)
      .then((catalog) => {
        this.skillCatalogs.set(key, {
          catalog,
          expiresAt: Date.now() + (catalog.reason ? 60000 : 3600000),
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
  ): Promise<SkillCatalog> {
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
        return unavailableSkillCatalog(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      const version = compatibleItemVersion(gameVersion, versions);
      if (!version)
        return unavailableSkillCatalog(
          gameVersion,
          championId,
          'unsupported_version',
        );
      const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR`;
      const index = catalogRecord(
        (
          await firstValueFrom(
            this.httpService.get<unknown>(`${base}/champion.json`, options),
          )
        ).data,
      );
      if (index.version !== version)
        return unavailableSkillCatalog(
          gameVersion,
          championId,
          'invalid_catalog',
        );
      const champion = Object.values(catalogRecord(index.data))
        .map(catalogRecord)
        .find((p) => p.key === String(championId));
      if (
        !champion ||
        typeof champion.id !== 'string' ||
        !/^[A-Za-z0-9]+$/.test(champion.id)
      )
        return unavailableSkillCatalog(
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
      return parseSkillCatalog(gameVersion, version, championId, raw);
    } catch {
      return unavailableSkillCatalog(gameVersion, championId);
    }
  }

  /** Network-free read for reports. Missing metadata must not block inventory. */
  getCachedItemCatalog(gameVersion: string): ItemCatalog {
    const entry = this.itemCatalogs.get(gameVersion);
    return entry && entry.expiresAt > Date.now()
      ? entry.catalog
      : unavailableItemCatalog(gameVersion);
  }

  /** Resolve within the match patch; never fall back to current/latest patch. */
  async getItemCatalogForGameVersion(
    gameVersion: string,
  ): Promise<ItemCatalog> {
    const cached = this.itemCatalogs.get(gameVersion);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;
    const pending = this.pendingItemCatalogs.get(gameVersion);
    if (pending) return pending;
    const request = this.loadItemCatalog(gameVersion)
      .then((catalog) => {
        this.itemCatalogs.set(gameVersion, {
          catalog,
          expiresAt: Date.now() + (catalog.reason ? 60_000 : 3_600_000),
        });
        return catalog;
      })
      .finally(() => this.pendingItemCatalogs.delete(gameVersion));
    this.pendingItemCatalogs.set(gameVersion, request);
    return request;
  }

  private async loadItemCatalog(gameVersion: string): Promise<ItemCatalog> {
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
        return unavailableItemCatalog(gameVersion, 'invalid_catalog');
      const version = compatibleItemVersion(gameVersion, versions);
      if (!version)
        return unavailableItemCatalog(gameVersion, 'unsupported_version');
      const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/item.json`;
      const rawFile = (
        await firstValueFrom(this.httpService.get<unknown>(url, options))
      ).data;
      const file = record(rawFile);
      const data = record(file?.data);
      if (file?.version !== version || !data)
        return unavailableItemCatalog(gameVersion, 'invalid_catalog');
      const items = Object.fromEntries(
        Object.entries(data).flatMap(([id, rawValue]) => {
          const value = record(rawValue);
          if (!/^\d+$/.test(id) || typeof value?.name !== 'string') return [];
          const filename = record(value.image)?.full;
          return [
            [
              id,
              {
                name: value.name,
                ...itemProgressionMetadata(value),
                imageUrl:
                  typeof filename === 'string' &&
                  /^[\w.-]+\.png$/.test(filename)
                    ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${filename}`
                    : null,
              },
            ],
          ];
        }),
      );
      return {
        gameVersion,
        version,
        locale: 'pt_BR',
        policy: 'latest_revision_of_exact_patch',
        reason: null,
        items,
      };
    } catch {
      return unavailableItemCatalog(gameVersion);
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
