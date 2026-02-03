import { Injectable, Logger } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { QueueService } from '../../core/queue/queue.service';
import { PrismaService } from '../../core/prisma/prisma.service';

interface MatchCollectionPayload {
  matchId: string;
}

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly riotService: RiotService,
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
  ) {}

  async runCollection(): Promise<void> {
    this.logger.log('🚀 [COLLECTOR] - Iniciando processo de coleta...');

    try {
      const highEloPuids = await this.riotService.getHighEloPuids();
      this.logger.log(
        `📊 [COLLECTOR] - Encontrados ${highEloPuids.length} jogadores high-elo`,
      );

      let totalMatchesFound = 0;
      let newMatchesEnqueued = 0;

      for (const puuid of highEloPuids) {
        try {
          const matchIds = await this.riotService.getMatchIdsByPuuid(puuid, 20);
          totalMatchesFound += matchIds.length;

          for (const matchId of matchIds) {
            const isNewMatch = await this.checkIfMatchIsNew(matchId);

            if (isNewMatch) {
              this.enqueueMatch(matchId);
              newMatchesEnqueued++;
            }
          }
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

  private async checkIfMatchIsNew(matchId: string): Promise<boolean> {
    try {
      // Otimização: Select apenas do ID para gastar menos memória
      const match = await this.prisma.match.findUnique({
        where: { matchId },
        select: { matchId: true },
      });

      return !match;
    } catch (error) {
      this.logger.warn(
        `⚠️ [COLLECTOR] - Erro ao verificar duplicata para ${matchId}:`,
        (error as Error).message,
      );
      return true;
    }
  }

  private enqueueMatch(matchId: string): void {
    const payload: MatchCollectionPayload = {
      matchId,
    };

    this.queueService.publish('match.collect', payload);

    this.logger.debug(
      `📤 [COLLECTOR] - Partida ${matchId} enfileirada para processamento`,
    );
  }
}
