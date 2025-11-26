import { Injectable, Logger } from '@nestjs/common';

/**
 * Serviço de semáforo para controlar concorrência
 * Garante que apenas N tarefas sejam executadas simultaneamente
 */
@Injectable()
export class SemaphoreService {
  private readonly logger = new Logger(SemaphoreService.name);
  private readonly queues: Map<string, PromiseQueue> = new Map();

  /**
   * Executa uma operação com controle de concorrência
   * @param key Chave única para o semáforo (ex: "worker_processing")
   * @param maxConcurrency Número máximo de execuções simultâneas
   * @param operation Função a ser executada
   */
  async execute<T>(
    key: string,
    maxConcurrency: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!this.queues.has(key)) {
      this.queues.set(key, new PromiseQueue(maxConcurrency));
    }

    const queue = this.queues.get(key)!;
    return queue.execute(operation);
  }

  /**
   * Obtém o status atual de um semáforo
   */
  getStatus(key: string): { running: number; queued: number } {
    const queue = this.queues.get(key);
    if (!queue) {
      return { running: 0, queued: 0 };
    }
    return {
      running: queue.running,
      queued: queue.queued,
    };
  }
}

/**
 * Fila de promessas com controle de concorrência
 */
class PromiseQueue {
  private queue: Array<() => void> = [];
  private runningCount = 0;

  constructor(private maxConcurrency: number) {}

  get running(): number {
    return this.runningCount;
  }

  get queued(): number {
    return this.queue.length;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.runningCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.runningCount++;

    try {
      return await operation();
    } finally {
      this.runningCount--;

      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}
