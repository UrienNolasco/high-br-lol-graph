import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import { gameVersionPatch } from '../../../core/metrics';

export interface ChampionMetrics {
  winRate: number | null;
  banRate: number | null;
  pickRate: number | null;
  kda: number | null;
  dpm: number | null;
  gpm: number | null;
  cspm: number | null;
  gamesPlayed: number;
}
type AvailableMetrics = { [K in keyof ChampionMetrics]: number };
export interface ScoreResult {
  score: number | null;
  tier: string;
  hasInsufficientData: boolean;
  reason?: string | null;
}
export const TIER_METHOD = {
  version: 2,
  kind: 'heuristic',
  minimumPerformanceSamples: 50,
  weights: {
    winRate: 0.35,
    banRate: 0.25,
    pickRate: 0.15,
    kda: 0.1,
    dpm: 0.08,
    gpm: 0.04,
    cspm: 0.03,
  },
  normalization:
    'clamp0..100: (WR-45)*10, BR*10, PR, KDA/3*100, DPM/1200*100, GPM/600*100, CSPM/8.5*100',
  sampleWeight: '50..99:0.90;100..199:0.94;200..499:0.97;500+:1.00',
  patchBlend:
    '0.7 current + 0.3 previous observed patch when both have complete inputs and >=50 performance samples',
  adjustment:
    '+5 if WR delta>2 and BR delta>1; -5 if WR delta<-2 and BR delta<-1',
  tiers:
    'S+ score>=80 and WR>51 and BR>5; S>=70; A>=55; B>=40; C>=30; otherwise D',
  limitation:
    'Descriptive heuristic, not statistical confidence or causal strength. Role composition is not controlled; no universal performance interpretation.',
} as const;
const complete = (m: ChampionMetrics | null): m is AvailableMetrics =>
  !!m &&
  Object.values(m).every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
  );
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const sampleWeight = (n: number) =>
  n >= 500 ? 1 : n >= 200 ? 0.97 : n >= 100 ? 0.94 : n >= 50 ? 0.9 : 0;
const base = (m: AvailableMetrics) =>
  (clamp((m.winRate - 45) * 10) * 0.35 +
    clamp(m.banRate * 10) * 0.25 +
    clamp(m.pickRate) * 0.15 +
    clamp((m.kda / 3) * 100) * 0.1 +
    clamp((m.dpm / 1200) * 100) * 0.08 +
    clamp((m.gpm / 600) * 100) * 0.04 +
    clamp((m.cspm / 8.5) * 100) * 0.03) *
  sampleWeight(m.gamesPlayed);

@Injectable()
export class TierRankService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only actual observed patch keys can be predecessors; no assumed patch count/padding. */
  async getPreviousPatch(
    currentPatch: string,
    queueId = 420,
  ): Promise<string | null> {
    const rows = await this.prisma.match.findMany({
      where: { queueId, mapId: 11 },
      distinct: ['gameVersion'],
      select: { gameVersion: true },
    });
    const patches = [
      ...new Set(
        rows
          .map((row) => gameVersionPatch(row.gameVersion))
          .filter((p): p is string => p !== null),
      ),
    ].sort((a, b) => {
      const [am, an] = a.split('.').map(Number),
        [bm, bn] = b.split('.').map(Number);
      return am - bm || an - bn;
    });
    const index = patches.indexOf(gameVersionPatch(currentPatch) ?? '');
    return index > 0 ? patches[index - 1] : null;
  }

  calculateChampionScore(
    _championId: number,
    _currentPatch: string,
    current: ChampionMetrics,
    previous: ChampionMetrics | null,
  ): ScoreResult {
    if (!complete(current) || current.gamesPlayed < 50)
      return {
        score: null,
        tier: 'Dados Insuficientes',
        hasInsufficientData: true,
        reason: !complete(current) ? 'missing_metric' : 'insufficient_sample',
      };
    let score = base(current);
    if (complete(previous) && previous.gamesPlayed >= 50) {
      score = score * 0.7 + base(previous) * 0.3;
      const wr = current.winRate - previous.winRate,
        br = current.banRate - previous.banRate;
      if (wr > 2 && br > 1) score += 5;
      else if (wr < -2 && br < -1) score -= 5;
    }
    const tier =
      score >= 80 && current.winRate > 51 && current.banRate > 5
        ? 'S+'
        : score >= 70
          ? 'S'
          : score >= 55
            ? 'A'
            : score >= 40
              ? 'B'
              : score >= 30
                ? 'C'
                : 'D';
    return { score, tier, hasInsufficientData: false, reason: null };
  }
  async getChampionStats(
    championId: number,
    patch: string,
    queueId: number,
  ): Promise<ChampionMetrics | null> {
    const row = await new ChampionStatsRepository(this.prisma).findUnique(
      championId,
      patch,
      queueId,
    );
    return row
      ? {
          winRate: row.winRate,
          banRate: row.banRate,
          pickRate: row.pickRate,
          kda: row.kda,
          dpm: row.dpm,
          gpm: row.gpm,
          cspm: row.cspm,
          gamesPlayed: row.performanceN,
        }
      : null;
  }
  async getAllChampionStats(patch: string, queueId = 420) {
    return new ChampionStatsRepository(this.prisma).findManyByPatch(
      patch,
      queueId,
    );
  }
}
