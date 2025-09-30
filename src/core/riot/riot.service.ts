import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, firstValueFrom } from 'rxjs';
import { LeagueListDto } from './dto/league-list.dto';
import { MatchDto } from './dto/match.dto';

@Injectable()
export class RiotService {
  private readonly logger = new Logger(RiotService.name);
  private readonly apiKey: string;
  private readonly brBaseUrl = 'https://br1.api.riotgames.com';
  private readonly americasBaseUrl = 'https://americas.api.riotgames.com';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('RIOT_API_KEY');
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

    try {
      const [challengerResponse, grandmasterResponse, masterResponse] =
        await Promise.all([
          firstValueFrom(
            this.httpService
              .get<LeagueListDto>(challengerUrl, {
                headers: this.createHeaders(),
              })
              .pipe(
                catchError((error) => {
                  this.logger.error(
                    'Failed to fetch challenger league',
                    error.stack,
                  );
                  throw new HttpException(
                    error.response.data,
                    error.response.status,
                  );
                }),
              ),
          ),
          firstValueFrom(
            this.httpService
              .get<LeagueListDto>(grandmasterUrl, {
                headers: this.createHeaders(),
              })
              .pipe(
                catchError((error) => {
                  this.logger.error(
                    'Failed to fetch grandmaster league',
                    error.stack,
                  );
                  throw new HttpException(
                    error.response.data,
                    error.response.status,
                  );
                }),
              ),
          ),
          firstValueFrom(
            this.httpService
              .get<LeagueListDto>(masterUrl, {
                headers: this.createHeaders(),
              })
              .pipe(
                catchError((error) => {
                  this.logger.error(
                    'Failed to fetch master league',
                    error.stack,
                  );
                  throw new HttpException(
                    error.response.data,
                    error.response.status,
                  );
                }),
              ),
          ),
        ]);

      const allEntries = [
        ...challengerResponse.data.entries,
        ...grandmasterResponse.data.entries,
        ...masterResponse.data.entries,
      ];

      const uniquePuids = [...new Set(allEntries.map((entry) => entry.puuid))];

      this.logger.log(`Found ${uniquePuids.length} unique PUUIDs.`);
      return uniquePuids;
    } catch (error) {
      this.logger.error('Failed to fetch high-elo PUUIDs', error.stack);
      throw error;
    }
  }

  async getMatchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    this.logger.log(`Fetching match IDs for PUUID: ${puuid}`);
    const url = `${this.americasBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<string[]>(url, { headers: this.createHeaders() })
          .pipe(
            catchError((error) => {
              this.logger.error(
                `Failed to fetch match IDs for PUUID ${puuid}`,
                error.stack,
              );
              throw new HttpException(
                error.response.data,
                error.response.status,
              );
            }),
          ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch match IDs for PUUID ${puuid}`,
        error.stack,
      );
      return [];
    }
  }

  async getMatchById(matchId: string): Promise<MatchDto> {
    this.logger.log(`Fetching match details for match ID: ${matchId}`);
    const url = `${this.americasBaseUrl}/lol/match/v5/matches/${matchId}`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<MatchDto>(url, { headers: this.createHeaders() })
          .pipe(
            catchError((error) => {
              this.logger.error(
                `Failed to fetch details for match ${matchId}`,
                error.stack,
              );
              throw new HttpException(
                error.response.data,
                error.response.status,
              );
            }),
          ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch details for match ${matchId}`,
        error.stack,
      );
      return null;
    }
  }
}
