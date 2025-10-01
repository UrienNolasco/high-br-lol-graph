import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import { ProcessedMatch } from '../../core/database/entities/processed-match.entity';

interface MatchCollectionPayload {
  matchId: string;
  patch: string;
}

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    @InjectRepository(ProcessedMatch)
    private readonly processedMatchRepository: Repository<ProcessedMatch>,
  ) {}

  /**
   * Executa o processo de coleta de partidas
   * Busca jogadores high-elo e suas partidas recentes
   * Filtra duplicatas e publica novas partidas na fila
   */
  async runCollection(): Promise<void> {
    this.logger.log('🚀 [COLLECTOR] - Iniciando processo de coleta...');

    try {
      // 1. Buscar PUUIDs dos jogadores high-elo (Master, Grandmaster, Challenger)
      const highEloPuids = await this.riotService.getHighEloPuids();
      this.logger.log(
        `📊 [COLLECTOR] - Encontrados ${highEloPuids.length} jogadores high-elo`,
      );

      // 2. Para cada jogador, buscar histórico de partidas
      let totalMatchesFound = 0;
      let newMatchesEnqueued = 0;

      for (const puuid of highEloPuids) {
        try {
          const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);
          totalMatchesFound += matchIds.length;

          // 3. Para cada partida, verificar se já foi processada
          for (const matchId of matchIds) {
            const isNewMatch = await this.checkIfMatchIsNew(matchId);

            if (isNewMatch) {
              // 4. Publicar na fila para processamento
              this.enqueueMatch(matchId);
              newMatchesEnqueued++;
            }
          }

          // Rate limiting agora é controlado automaticamente pelo RiotService
        } catch (error) {
          this.logger.warn(
            `⚠️ [COLLECTOR] - Erro ao processar PUUID ${puuid}:`,
            (error as Error).message,
          );
          continue;
        }
      }

      this.logger.log(`✅ [COLLECTOR] - Coleta finalizada!`);
      this.logger.log(
        `📈 [COLLECTOR] - Total de partidas encontradas: ${totalMatchesFound}`,
      );
      this.logger.log(
        `🆕 [COLLECTOR] - Novas partidas enfileiradas: ${newMatchesEnqueued}`,
      );
    } catch (error) {
      this.logger.error('❌ [COLLECTOR] - Erro durante a coleta:', error);
      throw error;
    }
  }

  /**
   * Verifica se uma partida já foi processada no patch atual
   */
  private async checkIfMatchIsNew(matchId: string): Promise<boolean> {
    try {
      // Extrair patch do matchId (formato: BR1_12345678)
      const patch = this.extractPatchFromMatchId();

      const existingMatch = await this.processedMatchRepository.findOne({
        where: { matchId, patch },
      });

      return !existingMatch;
    } catch (error) {
      this.logger.warn(
        `⚠️ [COLLECTOR] - Erro ao verificar duplicata para ${matchId}:`,
        (error as Error).message,
      );
      return true; // Em caso de erro, considera como nova para não perder dados
    }
  }

  /**
   * Extrai o patch de um matchId
   * Por enquanto retorna um patch padrão, mas pode ser implementado
   * baseado na data da partida ou outros critérios
   */
  private extractPatchFromMatchId(): string {
    // TODO: Implementar lógica para extrair patch real baseado na data
    // Por enquanto, usando um patch fixo para desenvolvimento
    return '15.20'; // Patch atual do League of Legends
  }

  /**
   * Publica uma partida na fila para processamento
   */
  private enqueueMatch(matchId: string): void {
    const payload: MatchCollectionPayload = {
      matchId,
      patch: this.extractPatchFromMatchId(),
    };

    this.queueService.publish('matches_to_process', 'match.collect', payload);

    this.logger.debug(
      `📤 [COLLECTOR] - Partida ${matchId} enfileirada para processamento`,
    );
  }

  /**
   * Utilitário para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
