import { Injectable, NotFoundException } from '@nestjs/common';
import { KillEpisodesRepository } from '../repositories/kill-episodes.repository';
import { calculateKillEpisodes } from '../pure/kill-episodes-calculator';
import { KILL_EPISODE_DEFINITION_VERSION } from '../pure/kill-episode-clustering';
@Injectable()
export class MatchKillEpisodesService {
  constructor(private readonly repository: KillEpisodesRepository) {}
  async getKillEpisodes(matchId: string) {
    const data = await this.repository.findKillEpisodes(matchId);
    if (!data) throw new NotFoundException(`Match ${matchId} not found`);
    if (data.input) return calculateKillEpisodes(data.input);
    const completedAt = data.source?.completedAt;
    return {
      matchId,
      gameVersion: data.match.gameVersion,
      metricVersion: KILL_EPISODE_DEFINITION_VERSION,
      processingVersion: data.source?.processingVersion ?? null,
      processedAt:
        completedAt && Number.isFinite(completedAt.getTime())
          ? completedAt.toISOString()
          : null,
      reason: 'missing_projection',
      report: null,
    };
  }
}
