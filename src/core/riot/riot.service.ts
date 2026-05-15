import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { LeagueListDto } from './dto/league-list.dto';
import { MatchDto } from './dto/match.dto';
import { TimelineDto } from './dto/timeline.dto';
import { AccountDto } from './dto/account.dto';
import { SummonerDto } from './dto/summoner.dto';
import { LeagueEntryDto } from './dto/league-entry.dto';
import { RateLimiterService } from './rate-limiter.service';
import { RetryService } from './retry.service';
import { getErrorMessage } from '../logger/get-error-message';

@Injectable()
export class RiotService {
  private readonly apiKey: string;
  private readonly brBaseUrl = 'https://br1.api.riotgames.com';
  private readonly americasBaseUrl = 'https://americas.api.riotgames.com';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly retryService: RetryService,
    private readonly logger: PinoLogger,
  ) {
    const apiKey = this.configService.get<string>('RIOT_API_KEY');
    this.apiKey = apiKey || '';
    this.logger.setContext(RiotService.name);
  }

  private ensureApiKey(): void {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('RIOT_API_KEY environment variable is required');
    }
  }

  async getAccountByRiotId(
    gameName: string,
    tagLine: string,
    region = 'americas',
  ): Promise<AccountDto> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const baseUrl =
        region === 'br1'
          ? 'https://br1.api.riotgames.com'
          : region === 'americas'
            ? 'https://americas.api.riotgames.com'
            : `https://${region}.api.riotgames.com`;

      const url = `${baseUrl}/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;

      const response = await firstValueFrom(
        this.httpService.get<AccountDto>(url, {
          headers: this.createHeaders(),
        }),
      );
      return response.data;
    }, `getAccountByRiotId(${gameName}#${tagLine})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getAccountByRiotId',
        gameName,
        tagLine,
        region,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }

  async getSummonerByPuuid(
    puuid: string,
    region = 'br1',
  ): Promise<SummonerDto> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const baseUrl =
        region === 'br1'
          ? this.brBaseUrl
          : `https://${region}.api.riotgames.com`;

      const url = `${baseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`;

      const response = await firstValueFrom(
        this.httpService.get<SummonerDto>(url, {
          headers: this.createHeaders(),
        }),
      );
      return response.data;
    }, `getSummonerByPuuid(${puuid})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getSummonerByPuuid',
        puuid,
        region,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }

  private createHeaders() {
    return {
      'X-Riot-Token': this.apiKey,
    };
  }

  async getHighEloPuids(): Promise<string[]> {
    this.ensureApiKey();
    const startTime = Date.now();

    const challengerUrl = `${this.brBaseUrl}/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
    const grandmasterUrl = `${this.brBaseUrl}/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
    const masterUrl = `${this.brBaseUrl}/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;

    const fetchLeague = async (url: string, leagueName: string) => {
      return this.retryService.executeWithRetry(async () => {
        await this.rateLimiterService.throttle(this.apiKey);
        const response = await firstValueFrom(
          this.httpService.get<LeagueListDto>(url, {
            headers: this.createHeaders(),
          }),
        );
        return response.data;
      }, `get${leagueName}League`);
    };

    const challengerLeague = await fetchLeague(challengerUrl, 'Challenger');
    const grandmasterLeague = await fetchLeague(grandmasterUrl, 'Grandmaster');
    const masterLeague = await fetchLeague(masterUrl, 'Master');

    const allEntries = [
      ...challengerLeague.entries,
      ...grandmasterLeague.entries,
      ...masterLeague.entries,
    ];

    const uniquePuids = [...new Set(allEntries.map((entry) => entry.puuid))];

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getHighEloPuids',
        puuidsFound: uniquePuids.length,
        duration: Date.now() - startTime,
      },
      'High-elo PUUIDs fetched',
    );
    return uniquePuids;
  }

  async getMatchIdsByPuuid(
    puuid: string,
    count = 20,
    options?: { start?: number; queue?: number },
  ): Promise<string[]> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const params = new URLSearchParams({ count: String(count) });
      if (options?.start !== undefined)
        params.set('start', String(options.start));
      if (options?.queue !== undefined)
        params.set('queue', String(options.queue));

      const url = `${this.americasBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params.toString()}`;

      const response = await firstValueFrom(
        this.httpService.get<string[]>(url, { headers: this.createHeaders() }),
      );
      return response.data;
    }, `getMatchIdsByPuuid(${puuid})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getMatchIdsByPuuid',
        puuid,
        count,
        matchesFound: result.length,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }

  async getMatchById(matchId: string): Promise<MatchDto> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const url = `${this.americasBaseUrl}/lol/match/v5/matches/${matchId}`;

      const response = await firstValueFrom(
        this.httpService.get<MatchDto>(url, { headers: this.createHeaders() }),
      );
      return response.data;
    }, `getMatchById(${matchId})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getMatchById',
        matchId,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }

  /**
   * Busca a timeline de uma partida.
   * Retorna null se a timeline não existir (404) ou se for uma partida muito antiga.
   *
   * @param matchId - ID da partida (ex: BR1_1234567890)
   * @returns TimelineDto ou null se não existir
   */
  async getTimeline(matchId: string): Promise<TimelineDto | null> {
    this.ensureApiKey();
    const startTime = Date.now();

    try {
      const result = await this.retryService.executeWithRetry(async () => {
        await this.rateLimiterService.throttle(this.apiKey);

        const url = `${this.americasBaseUrl}/lol/match/v5/matches/${matchId}/timeline`;

        const response = await firstValueFrom(
          this.httpService.get<TimelineDto>(url, {
            headers: this.createHeaders(),
          }),
        );
        return response.data;
      }, `getTimeline(${matchId})`);

      this.logger.info(
        {
          operation: 'riot_api',
          endpoint: 'getTimeline',
          matchId,
          duration: Date.now() - startTime,
        },
        'Riot API call completed',
      );
      return result;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        this.logger.warn(
          {
            operation: 'riot_api',
            endpoint: 'getTimeline',
            matchId,
            statusCode: 404,
            duration: Date.now() - startTime,
          },
          'Timeline not found for match (404)',
        );
        return null;
      }
      this.logger.error(
        {
          operation: 'riot_api',
          endpoint: 'getTimeline',
          matchId,
          duration: Date.now() - startTime,
          error: getErrorMessage(error),
        },
        'Failed to fetch timeline',
      );
      throw error;
    }
  }

  async getRankedStatsBySummonerId(
    summonerId: string,
    region = 'br1',
  ): Promise<LeagueEntryDto[]> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const baseUrl =
        region === 'br1'
          ? this.brBaseUrl
          : `https://${region}.api.riotgames.com`;

      const url = `${baseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`;

      const response = await firstValueFrom(
        this.httpService.get<LeagueEntryDto[]>(url, {
          headers: this.createHeaders(),
        }),
      );
      return response.data;
    }, `getRankedStatsBySummonerId(${summonerId})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getRankedStatsBySummonerId',
        summonerId,
        region,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }

  async getRankedStatsByPuuid(
    puuid: string,
    region = 'br1',
  ): Promise<LeagueEntryDto[]> {
    this.ensureApiKey();
    const startTime = Date.now();

    const result = await this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle(this.apiKey);

      const baseUrl =
        region === 'br1'
          ? this.brBaseUrl
          : `https://${region}.api.riotgames.com`;

      const url = `${baseUrl}/lol/league/v4/entries/by-puuid/${puuid}`;

      const response = await firstValueFrom(
        this.httpService.get<LeagueEntryDto[]>(url, {
          headers: this.createHeaders(),
        }),
      );
      return response.data;
    }, `getRankedStatsByPuuid(${puuid})`);

    this.logger.info(
      {
        operation: 'riot_api',
        endpoint: 'getRankedStatsByPuuid',
        puuid,
        region,
        duration: Date.now() - startTime,
      },
      'Riot API call completed',
    );
    return result;
  }
}
