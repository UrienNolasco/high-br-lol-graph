// src/riot/riot.module.ts

import { Module, Logger } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RiotService } from './riot.service';
import { MatchParserService } from './match-parser.service';
import { RateLimiterService } from './rate-limiter.service';
import { RetryService } from './retry.service';
import { AxiosError } from 'axios';
import * as https from 'https';
import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    // Use registerAsync para configurar a instância do Axios
    HttpModule.registerAsync({
      useFactory: () => ({
        // Você pode colocar configurações padrão do Axios aqui (timeout, etc.)
        timeout: 5000,
        // Configuração para resolver problemas de certificado SSL em Docker
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }),
    }),
  ],
  providers: [
    RiotService,
    MatchParserService,
    RateLimiterService,
    RetryService,
    Logger,
  ],
  exports: [
    RiotService,
    MatchParserService,
    RateLimiterService,
    RetryService,
  ],
})
export class RiotModule {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
  ) {
    // Pega a instância do Axios gerenciada pelo NestJS
    const axiosInstance = this.httpService.axiosRef;

    // Adiciona o interceptor de resposta diretamente na instância
    axiosInstance.interceptors.response.use(
      // Se a resposta for bem-sucedida, apenas a retorna
      (response) => response,

      // Se a resposta falhar, nosso tratador de erro entra em ação
      (error: AxiosError<unknown>) => this.handleRiotApiError(error),
    );
  }

  private handleRiotApiError(error: AxiosError<unknown>): never {
    const { config, response } = error;
    const url = config?.url || 'URL desconhecida';

    // Se não houver uma resposta do servidor (erro de rede, timeout)
    if (!response) {
      this.logger.error(
        `Erro de rede ou timeout ao acessar ${url}`,
        error.stack,
      );
      throw new ServiceUnavailableException(
        `A API externa em ${url} está indisponível.`,
      );
    }

    const status = response.status;
    const data = response.data;

    this.logger.error(
      `Erro da Riot API: ${status} em ${url}`,
      JSON.stringify(data),
    );

    // Mapeia o status code para uma exceção específica do NestJS
    switch (status) {
      case 400:
        throw new BadRequestException(data);
      case 401:
        throw new UnauthorizedException(data);
      case 403:
        throw new ForbiddenException(data);
      case 404:
        throw new NotFoundException(data);
      case 429:
        this.logger.warn(
          `Rate limit exceeded for ${url}. Consider implementing retry logic.`,
        );
        throw new HttpException('Rate limit exceeded', 429);
      case 500:
        throw new InternalServerErrorException(data);
      case 502:
      case 503:
        throw new ServiceUnavailableException(data);
      case 504:
        throw new GatewayTimeoutException(data);
      default: {
        const responseBody =
          typeof data === 'object' && data !== null
            ? data
            : {
                statusCode: status,
                message: `An unexpected error occurred with the external API.`,
                originalResponse: data,
              };

        throw new HttpException(responseBody, status);
      }
    }
  }
}
