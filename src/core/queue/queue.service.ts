import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class QueueService implements OnModuleDestroy {
  constructor(
    @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy,
  ) {}

  /**
   * Publica uma mensagem em uma fila específica.
   * @param queue O nome da fila de destino.
   * @param pattern O padrão do evento (usado para roteamento no NestJS).
   * @param payload O dado a ser enviado.
   */
  public publish(queue: string, pattern: string, payload: any) {
    // O método 'emit' envia uma mensagem do tipo "evento" (fire-and-forget).
    // O primeiro argumento é um objeto que pode especificar a fila,
    // e o segundo é o payload com o padrão e os dados.
    this.client.emit({ q: queue }, { pattern, data: payload });
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
