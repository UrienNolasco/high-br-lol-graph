import { Injectable, Logger } from '@nestjs/common';

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstLimit: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  // Configuração para API Key de desenvolvimento da Riot
  private readonly config: RateLimitConfig = {
    requestsPerSecond: 20, // 20 requests every 1 second
    requestsPerMinute: 100, // 100 requests every 2 minutes (vamos usar 1 minuto para segurança)
    burstLimit: 25, // Permite alguns requests extras em caso de burst
  };

  // Tokens disponíveis para requisições por segundo
  private tokensPerSecond = this.config.requestsPerSecond;

  // Tokens disponíveis para requisições por minuto
  private tokensPerMinute = this.config.requestsPerMinute;

  // Timestamps das últimas atualizações
  private lastSecondUpdate = Date.now();
  private lastMinuteUpdate = Date.now();

  /**
   * Verifica se uma requisição pode ser feita e consome os tokens necessários
   * @returns Promise que resolve quando a requisição pode ser feita
   */
  async waitForToken(): Promise<void> {
    const now = Date.now();

    // Atualiza tokens baseado no tempo decorrido
    this.updateTokens(now);

    // Verifica se há tokens disponíveis
    if (this.tokensPerSecond > 0 && this.tokensPerMinute > 0) {
      // Consome um token de cada bucket
      this.tokensPerSecond--;
      this.tokensPerMinute--;

      this.logger.debug(
        `Rate limit: Tokens restantes - Segundo: ${this.tokensPerSecond}, Minuto: ${this.tokensPerMinute}`,
      );

      return;
    }

    // Se não há tokens disponíveis, calcula o tempo de espera
    const waitTime = this.calculateWaitTime(now);

    if (waitTime > 0) {
      this.logger.warn(
        `Rate limit atingido. Aguardando ${waitTime}ms antes da próxima requisição`,
      );

      await this.sleep(waitTime);

      // Após aguardar, tenta novamente
      return this.waitForToken();
    }
  }

  /**
   * Atualiza os tokens baseado no tempo decorrido
   */
  private updateTokens(now: number): void {
    const secondElapsed = (now - this.lastSecondUpdate) / 1000;
    const minuteElapsed = (now - this.lastMinuteUpdate) / 1000 / 60;

    // Recarrega tokens por segundo
    if (secondElapsed >= 1) {
      const tokensToAdd = Math.floor(
        secondElapsed * this.config.requestsPerSecond,
      );
      this.tokensPerSecond = Math.min(
        this.config.requestsPerSecond,
        this.tokensPerSecond + tokensToAdd,
      );
      this.lastSecondUpdate = now;
    }

    // Recarrega tokens por minuto
    if (minuteElapsed >= 1) {
      const tokensToAdd = Math.floor(
        minuteElapsed * this.config.requestsPerMinute,
      );
      this.tokensPerMinute = Math.min(
        this.config.requestsPerMinute,
        this.tokensPerMinute + tokensToAdd,
      );
      this.lastMinuteUpdate = now;
    }
  }

  /**
   * Calcula o tempo de espera necessário
   */
  private calculateWaitTime(now: number): number {
    const secondElapsed = (now - this.lastSecondUpdate) / 1000;
    const minuteElapsed = (now - this.lastMinuteUpdate) / 1000 / 60;

    // Calcula tempo para recarregar tokens por segundo
    const timeToNextSecondToken =
      this.tokensPerSecond <= 0 ? (1 - (secondElapsed % 1)) * 1000 : 0;

    // Calcula tempo para recarregar tokens por minuto
    const timeToNextMinuteToken =
      this.tokensPerMinute <= 0 ? (60 - (minuteElapsed % 60)) * 1000 : 0;

    return Math.max(timeToNextSecondToken, timeToNextMinuteToken);
  }

  /**
   * Utilitário para aguardar um tempo específico
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retorna informações sobre o estado atual do rate limit
   */
  getStatus() {
    const now = Date.now();
    this.updateTokens(now);

    return {
      tokensPerSecond: Math.max(0, this.tokensPerSecond),
      tokensPerMinute: Math.max(0, this.tokensPerMinute),
      config: this.config,
      canMakeRequest: this.tokensPerSecond > 0 && this.tokensPerMinute > 0,
    };
  }

  /**
   * Força o reset dos tokens (útil para testes ou situações especiais)
   */
  resetTokens(): void {
    this.tokensPerSecond = this.config.requestsPerSecond;
    this.tokensPerMinute = this.config.requestsPerMinute;
    this.lastSecondUpdate = Date.now();
    this.lastMinuteUpdate = Date.now();

    this.logger.log('Rate limit tokens resetados');
  }
}
