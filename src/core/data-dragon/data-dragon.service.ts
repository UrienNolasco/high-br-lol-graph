import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

// Interface para definir a estrutura de um campeão no nosso JSON
interface ChampionData {
  version: string;
  id: string;
  key: string; // Este é o nosso championId numérico
  name: string;
  title: string;
}

// Interface para a estrutura completa do arquivo champions.json
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

  // Usaremos Maps para buscas O(1), que são extremamente rápidas.
  private championsById: Map<number, ChampionData> = new Map();
  private championsByName: Map<string, ChampionData> = new Map();

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    this.loadChampionData();
  }

  private loadChampionData() {
    try {
      // Constrói o caminho para o arquivo champions.json na raiz do projeto
      const filePath = path.join(process.cwd(), 'champions.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData: ChampionsFile = JSON.parse(fileContent) as ChampionsFile;

      // O JSON tem uma estrutura aninhada, então pegamos os dados de 'data'
      const champions = jsonData.data;

      for (const championKey in champions) {
        const champion = champions[championKey];
        const championId = parseInt(champion.key, 10);

        // Populamos nossos mapas para buscas rápidas
        this.championsById.set(championId, champion);
        // Usamos o nome em minúsculas e sem espaços para uma busca mais robusta
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

  // --- MÉTODOS PÚBLICOS ---

  public getChampionById(id: number): ChampionData | undefined {
    return this.championsById.get(id);
  }

  public getChampionByName(name: string): ChampionData | undefined {
    // Normaliza o nome recebido da mesma forma que fizemos ao carregar
    const normalizedName = name.toLowerCase().replace(/\s/g, '');
    return this.championsByName.get(normalizedName);
  }

  public getAllChampions(): ChampionData[] {
    // Retorna todos os campeões como um array ordenado por nome
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
   * @returns String com o patch atual no formato X.Y
   */
  public async getCurrentPatch(): Promise<string> {
    const versions = await this.getVersions();

    if (!versions || versions.length === 0) {
      throw new Error('Nenhuma versão encontrada');
    }

    // Pega a versão mais recente (primeira do array)
    const latestVersion = versions[0];

    // Remove o terceiro número da versão (ex: 15.23.1 -> 15.23)
    const patchParts = latestVersion.split('.');
    if (patchParts.length >= 2) {
      return `${patchParts[0]}.${patchParts[1]}`;
    }

    // Fallback: retorna a versão completa se não conseguir parsear
    return latestVersion;
  }
}
