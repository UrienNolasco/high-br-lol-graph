import { Injectable } from '@nestjs/common';
import { MatchCountRepository } from '../repositories/match-count.repository';

@Injectable()
export class ProcessedMatchesService {
  constructor(private readonly repo: MatchCountRepository) {}

  async getProcessedMatches(
    patch?: string,
  ): Promise<{ count: number; patch?: string; message?: string }> {
    if (patch) {
      const count = await this.repo.countByPatch(patch);
      if (count === 0) {
        return { count: 0, patch, message: `Não há dados para o patch ${patch}` };
      }
      return { count, patch };
    }
    const totalCount = await this.repo.countTotal();
    return { count: totalCount };
  }
}
