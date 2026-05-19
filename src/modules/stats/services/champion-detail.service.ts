import { Injectable, NotFoundException } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { TierRankService, ChampionMetrics } from './tier-rank.service';
import { ChampionStatsDto } from '../dto/champion-stats.dto';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import { toChampionMetrics, r2 } from '../pure/champion.enricher';

@Injectable()
export class ChampionDetailService {
  constructor(
    private readonly repo: ChampionStatsRepository,
    private readonly dataDragon: DataDragonService,
    private readonly tierRank: TierRankService,
  ) {}

  async getChampion(
    championName: string,
    patch: string,
  ): Promise<ChampionStatsDto> {
    const championInfo = this.dataDragon.getChampionByName(championName);
    if (!championInfo) {
      throw new NotFoundException(`Champion ${championName} not found`);
    }

    const championId = parseInt(championInfo.key, 10);
    const stats = await this.repo.findByChampionIdAndPatch(championId, patch);

    if (!stats) {
      throw new NotFoundException(
        `Stats for champion ${championName} not found on patch ${patch}`,
      );
    }

    const images = await this.dataDragon.getChampionImageUrls(championInfo.id);
    const currentMetrics = toChampionMetrics(stats);

    const previousPatch = this.tierRank.getPreviousPatch(patch);
    let previousMetrics: ChampionMetrics | null = null;
    if (previousPatch) {
      previousMetrics = await this.tierRank.getChampionStats(
        championId,
        previousPatch,
        stats.queueId,
      );
    }

    const scoreResult = this.tierRank.calculateChampionScore(
      championId,
      patch,
      currentMetrics,
      previousMetrics,
    );

    let rank: number | null = null;
    if (!scoreResult.hasInsufficientData) {
      const allStats = await this.repo.findQualifiedStats(patch, 50);
      const allPreviousMap = new Map<
        number,
        ReturnType<typeof toChampionMetrics>
      >();

      if (previousPatch) {
        const prevAll = await this.repo.findQualifiedStats(previousPatch, 50);
        for (const p of prevAll) {
          allPreviousMap.set(p.championId, toChampionMetrics(p));
        }
      }

      const scores = allStats.map((s) => {
        const prev = allPreviousMap.get(s.championId) || null;
        const result = this.tierRank.calculateChampionScore(
          s.championId,
          patch,
          toChampionMetrics(s),
          prev,
        );
        return {
          championId: s.championId,
          score: result.score,
          hasInsufficientData: result.hasInsufficientData,
        };
      });

      const validScores = scores
        .filter((s) => !s.hasInsufficientData)
        .sort((a, b) => b.score - a.score);
      const idx = validScores.findIndex((s) => s.championId === championId);
      if (idx !== -1) rank = idx + 1;
    }

    return {
      championId: stats.championId,
      championName: championInfo.name,
      winRate: r2(stats.winRate),
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      images,
      kda: r2(stats.kda),
      dpm: r2(stats.dpm),
      cspm: r2(stats.cspm),
      gpm: r2(stats.gpm),
      banRate: r2(stats.banRate),
      pickRate: r2(stats.pickRate),
      tier: scoreResult.tier,
      rank,
    };
  }
}
