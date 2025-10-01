import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiotService } from '../../core/riot/riot.service';
import { MatchParserService } from '../../core/riot/match-parser.service';
import { ChampionStats } from '../../core/database/entities/champion-stats.entity';
import { MatchupStats } from '../../core/database/entities/matchup-stats.entity';
import { ProcessedMatch } from '../../core/database/entities/processed-match.entity';
import { MatchDto, ChampionsData } from '../../core/riot/dto/match.dto';
import * as championsData from '../../../champions.json';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private readonly championsMap: Map<string, string> = new Map();

  constructor(
    @InjectRepository(ChampionStats)
    private readonly championStatsRepository: Repository<ChampionStats>,
    @InjectRepository(MatchupStats)
    private readonly matchupStatsRepository: Repository<MatchupStats>,
    @InjectRepository(ProcessedMatch)
    private readonly processedMatchRepository: Repository<ProcessedMatch>,
    private readonly riotService: RiotService,
    private readonly matchParserService: MatchParserService,
  ) {
    this.initializeChampionsMap();
  }

  private initializeChampionsMap() {
    const champions = (championsData as ChampionsData).data;
    Object.values(champions).forEach((champion) => {
      this.championsMap.set(champion.key, champion.id);
    });
    this.logger.log(
      `Mapeamento de champions inicializado com ${this.championsMap.size} campeões`,
    );
  }

  async processMatch(matchId: string): Promise<void> {
    try {
      this.logger.log(`Processando partida: ${matchId}`);

      // Verificar se a partida já foi processada
      const existingMatch = await this.processedMatchRepository.findOne({
        where: { matchId },
      });

      if (existingMatch) {
        this.logger.log(`Partida ${matchId} já foi processada anteriormente`);
        return;
      }

      // Buscar detalhes da partida na API da Riot
      const matchData: MatchDto = await this.riotService.getMatchById(matchId);

      // Parsear dados da partida (otimizado, apenas 1 iteração)
      const parsedData = this.matchParserService.parseMatchData(matchData);

      // Processar estatísticas de campeões
      await this.processChampionStats(
        parsedData.patch,
        parsedData.participants,
      );

      // Processar estatísticas de matchups (agora com os matchups corretos por lane)
      await this.processMatchupStatsOptimized(
        parsedData.patch,
        parsedData.matchups,
      );

      // Marcar partida como processada
      await this.markMatchAsProcessed(matchId, parsedData.patch);

      this.logger.log(`Partida ${matchId} processada com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao processar partida ${matchId}:`, error);
      throw error;
    }
  }

  private async processChampionStats(
    patch: string,
    participants: Array<{
      championId: number;
      championName: string;
      win: boolean;
    }>,
  ): Promise<void> {
    for (const participant of participants) {
      // Buscar ou criar registro de estatísticas do campeão
      let championStats = await this.championStatsRepository.findOne({
        where: { patch, championId: participant.championId },
      });

      if (!championStats) {
        championStats = this.championStatsRepository.create({
          patch,
          championId: participant.championId,
          gamesPlayed: 0,
          wins: 0,
        });
      }

      // Atualizar estatísticas
      championStats.gamesPlayed += 1;
      if (participant.win) {
        championStats.wins += 1;
      }

      await this.championStatsRepository.save(championStats);
    }
  }

  /**
   * Versão otimizada que processa apenas matchups por lane (5 matchups por partida)
   * Ao invés de O(n²) com 25 matchups (MUITO mais eficiente!)
   */
  private async processMatchupStatsOptimized(
    patch: string,
    matchups: Array<{
      position: string;
      championBlueSide: string;
      championRedSide: string;
      winningChampion: string;
    }>,
  ): Promise<void> {
    for (const matchup of matchups) {
      const championId1 = this.championsMap.get(matchup.championBlueSide);
      const championId2 = this.championsMap.get(matchup.championRedSide);

      if (!championId1 || !championId2) {
        this.logger.warn(
          `Champions ${matchup.championBlueSide} ou ${matchup.championRedSide} não encontrados no mapeamento`,
        );
        continue;
      }

      const championId1Num = parseInt(championId1);
      const championId2Num = parseInt(championId2);

      // Determinar qual campeão tem o menor ID para manter consistência
      const [lowerId, higherId] =
        championId1Num < championId2Num
          ? [championId1Num, championId2Num]
          : [championId2Num, championId1Num];

      const lowerChampionName =
        championId1Num < championId2Num
          ? matchup.championBlueSide
          : matchup.championRedSide;

      // Buscar ou criar registro de matchup
      let matchupStats = await this.matchupStatsRepository.findOne({
        where: {
          patch,
          championId1: lowerId,
          championId2: higherId,
          role: matchup.position,
        },
      });

      if (!matchupStats) {
        matchupStats = this.matchupStatsRepository.create({
          patch,
          championId1: lowerId,
          championId2: higherId,
          role: matchup.position,
          gamesPlayed: 0,
          champion1Wins: 0,
        });
      }

      // Atualizar estatísticas
      matchupStats.gamesPlayed += 1;
      if (matchup.winningChampion === lowerChampionName) {
        matchupStats.champion1Wins += 1;
      }

      await this.matchupStatsRepository.save(matchupStats);
    }
  }

  private async markMatchAsProcessed(
    matchId: string,
    patch: string,
  ): Promise<void> {
    const processedMatch = this.processedMatchRepository.create({
      matchId,
      patch,
    });

    await this.processedMatchRepository.save(processedMatch);
  }

  async getChampionStats(
    patch: string,
    championId: number,
  ): Promise<ChampionStats | null> {
    return this.championStatsRepository.findOne({
      where: { patch, championId },
    });
  }

  async getMatchupStats(
    patch: string,
    championId1: number,
    championId2: number,
    role: string = 'SOLO',
  ): Promise<MatchupStats | null> {
    // Garantir que championId1 seja sempre o menor
    const [lowerId, higherId] =
      championId1 < championId2
        ? [championId1, championId2]
        : [championId2, championId1];

    return this.matchupStatsRepository.findOne({
      where: {
        patch,
        championId1: lowerId,
        championId2: higherId,
        role,
      },
    });
  }
}
