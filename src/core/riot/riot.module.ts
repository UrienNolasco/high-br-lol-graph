import { Module, Logger } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RiotService } from './riot.service';
import { MatchParserService } from './match-parser.service';
import { TimelineParserService } from './timeline-parser.service';
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

import { LockModule } from '../lock/lock.module';

@Module({
  imports: [
    ConfigModule,
    LockModule,
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }),
    }),
  ],
  providers: [
    RiotService,
    MatchParserService,
    TimelineParserService,
    RateLimiterService,
    RetryService,
    Logger,
  ],
  exports: [RiotService, MatchParserService, TimelineParserService, RateLimiterService, RetryService],
})
export class RiotModule {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
  ) {
    const axiosInstance = this.httpService.axiosRef;

    axiosInstance.interceptors.response.use(
      (response) => response,

      (error: AxiosError<unknown>) => this.handleRiotApiError(error),
    );
  }

  private handleRiotApiError(error: AxiosError<unknown>): never {
    const { config, response } = error;
    const url = config?.url || 'URL desconhecida';

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
