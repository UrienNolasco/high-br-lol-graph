import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
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

    const [challengerResponse, grandmasterResponse, masterResponse] =
      await Promise.all([
        firstValueFrom(
          this.httpService.get<LeagueListDto>(challengerUrl, {
            headers: this.createHeaders(),
          }),
        ),
        firstValueFrom(
          this.httpService.get<LeagueListDto>(grandmasterUrl, {
            headers: this.createHeaders(),
          }),
        ),
        firstValueFrom(
          this.httpService.get<LeagueListDto>(masterUrl, {
            headers: this.createHeaders(),
          }),
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
  }

  async getMatchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    this.logger.log(`Fetching match IDs for PUUID: ${puuid}`);
    const url = `${this.americasBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}`;

    const response = await firstValueFrom(
      this.httpService.get<string[]>(url, { headers: this.createHeaders() }),
    );
    return response.data;
  }

  async getMatchById(matchId: string): Promise<MatchDto> {
    this.logger.log(`Fetching match details for match ID: ${matchId}`);
    const url = `${this.americasBaseUrl}/lol/match/v5/matches/${matchId}`;

    const response = await firstValueFrom(
      this.httpService.get<MatchDto>(url, { headers: this.createHeaders() }),
    );
    return response.data;
  }
}
