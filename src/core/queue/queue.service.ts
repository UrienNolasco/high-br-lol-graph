import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { RABBITMQ_CHANNEL } from './queue.constants';

export interface MatchPublishOptions {
  priority?: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queueName: string;

  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: any,
  ) {
    this.queueName = process.env.RABBITMQ_QUEUE || 'default_queue';
  }

  /**
   * Publica uma partida na fila com prioridade específica.
   *
   * @param pattern - O padrão da rota (ex: 'match.collect')
   * @param payload - O payload contendo { matchId: string }
   * @param options - Opções de publicação, incluindo prioridade (0-10)
   */
  publish(
    pattern: string,
    payload: { matchId: string },
    options?: MatchPublishOptions,
  ): void {
    const priority = options?.priority ?? 1;

    // NestJS microservice espera o formato: { pattern, data }
    const message = {
      pattern,
      data: payload,
    };

    const buffer = Buffer.from(JSON.stringify(message));

    this.channel.sendToQueue(
      this.queueName,
      buffer,
      {
        persistent: true,
        priority,
      },
    );

    this.logger.debug(
      `[QUEUE] - Publicado ${pattern} com prioridade ${priority}: ${payload.matchId}`,
    );
  }

  /**
   * Publica uma partida solicitada pelo usuário (prioridade máxima).
   * Usado pelo endpoint /players/search quando usuário clica em "Atualizar".
   *
   * Priority: 10 (Máxima) - Processado antes de qualquer outra mensagem.
   */
  publishUserRequestedMatch(matchId: string): void {
    this.publish('match.collect', { matchId }, { priority: 10 });
    this.logger.log(
      `[QUEUE] - Partida prioritária enfileirada: ${matchId} (prioridade 10)`,
    );
  }

  /**
   * Publica uma partida de background (prioridade baixa).
   * Usado pelo Crawler automático ou atualizações periódicas.
   *
   * Priority: 1 (Baixa) - Processado apenas se não houver prioridade 10 na fila.
   */
  publishBackgroundMatch(matchId: string): void {
    this.publish('match.collect', { matchId }, { priority: 1 });
  }

  async onModuleDestroy() {
    try {
      await this.channel.close();
    } catch (error) {
      this.logger.error('Erro ao fechar canal do RabbitMQ', error);
    }
  }
}
