import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LeagueListDto } from './dto/league-list.dto';
import { MatchDto } from './dto/match.dto';
import { RateLimiterService } from './rate-limiter.service';
import { RetryService } from './retry.service';

@Injectable()
export class RiotService {
  private readonly logger = new Logger(RiotService.name);
  private readonly apiKey: string;
  private readonly brBaseUrl = 'https://br1.api.riotgames.com';
  private readonly americasBaseUrl = 'https://americas.api.riotgames.com';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly retryService: RetryService,
  ) {
    const apiKey = this.configService.get<string>('RIOT_API_KEY');
    if (!apiKey) {
      throw new Error('RIOT_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  private createHeaders() {
    return {
      'X-Riot-Token': this.apiKey,
    };
  }

  async getHighEloPuids(): Promise<string[]> {
    this.logger.log('Fetching high-elo leagues...');

    const challengerUrl = `${this.brBaseUrl}/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
    const grandmasterUrl = `${this.brBaseUrl}/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
    const masterUrl = `${this.brBaseUrl}/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;

    const fetchLeague = async (url: string, leagueName: string) => {
      return this.retryService.executeWithRetry(async () => {
        await this.rateLimiterService.throttle();
        this.logger.log(`Fetching ${leagueName} league...`);
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

    this.logger.log(`Found ${uniquePuids.length} unique PUUIDs.`);
    return uniquePuids;
  }

  async getMatchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    this.logger.log(`Fetching match IDs for PUUID: ${puuid}`);

    return this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle();

      const url = `${this.americasBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`;

      const response = await firstValueFrom(
        this.httpService.get<string[]>(url, { headers: this.createHeaders() }),
      );
      return response.data;
    }, `getMatchIdsByPuuid(${puuid})`);
  }

  async getMatchById(matchId: string): Promise<MatchDto> {
    this.logger.log(`Fetching match details for match ID: ${matchId}`);

    return this.retryService.executeWithRetry(async () => {
      await this.rateLimiterService.throttle();

      const url = `${this.americasBaseUrl}/lol/match/v5/matches/${matchId}`;

      const response = await firstValueFrom(
        this.httpService.get<MatchDto>(url, { headers: this.createHeaders() }),
      );
      return response.data;
    }, `getMatchById(${matchId})`);
  }
}
