import { Injectable } from '@nestjs/common';

@Injectable()
export class ApiService {
  getChampionStats(
    patch: string,
    page: number,
    limit: number,
    sortBy: string,
    order: string,
  ) {
    console.log({ patch, page, limit, sortBy, order });
    return 'getChampionStats not implemented';
  }

  getChampion(championName: string, patch: string) {
    console.log({ championName, patch });
    return 'getChampion not implemented';
  }

  getMatchupStats(
    championA: string,
    championB: string,
    patch: string,
    role: string,
  ) {
    console.log({ championA, championB, patch, role });
    return 'getMatchupStats not implemented';
  }
}
