import { historicalSolo } from '../pure/historical-solo';
import { projectionComparisonTimeline } from '../pure/comparison-timeline.adapter';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnalyticsRepository,
  TimelineFilters,
} from '../repositories/analytics.repository';
import { generateInsights } from '../pure/insights-generator';
import { PlayerComparisonDto } from '../dto/compare-evolve.dto';
import { calculateCohort } from '../pure/cohort-calculator';
import { normalizeRole } from '../../matches/contracts/eligibility';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  async comparePlayerPerformance(
    heroPuuid: string,
    villainPuuid: string,
    filters: TimelineFilters,
  ): Promise<PlayerComparisonDto> {
    if (
      filters.startDate !== undefined &&
      filters.endDate !== undefined &&
      filters.startDate > filters.endDate
    ) {
      throw new BadRequestException(
        'startDate deve ser menor ou igual a endDate',
      );
    }
    const effectiveFilters = {
      ...filters,
      role: filters.role
        ? (normalizeRole(filters.role) ?? undefined)
        : undefined,
      patch: filters.patch || 'ALL',
      queueId: filters.queueId ?? 420,
      limit: filters.limit ?? 100,
    };
    const [heroUser, villainUser] = await Promise.all([
      this.analyticsRepo.findUserByPuuid(heroPuuid),
      this.analyticsRepo.findUserByPuuid(villainPuuid),
    ]);
    if (!heroUser)
      throw new NotFoundException(`Jogador herói ${heroPuuid} não encontrado`);
    if (!villainUser)
      throw new NotFoundException(
        `Jogador vilão ${villainPuuid} não encontrado`,
      );
    const [heroRows, villainRows] = await Promise.all([
      this.analyticsRepo.findComparisonCohort(heroPuuid, effectiveFilters),
      this.analyticsRepo.findComparisonCohort(villainPuuid, effectiveFilters),
    ]);
    const compute = (rows: typeof heroRows) => {
      const result = calculateCohort(
        rows.matches,
        new Map(
          rows.projections.map((r) => [
            r.matchId,
            projectionComparisonTimeline(r),
          ]),
        ),
      );
      const solo = historicalSolo(
        rows.matches,
        rows.events ?? [],
        rows.eventSources ?? [],
      );
      return { ...result, laningPhase: { ...result.laningPhase, ...solo } };
    };
    const hero = compute(heroRows),
      villain = compute(villainRows);
    const cohort = (rows: typeof heroRows) => ({
      eligibleN: rows.eligibleN,
      returnedN: rows.returnedN,
      limit: rows.limit,
      truncated: rows.truncated,
      order: 'gameCreation DESC, matchId ASC',
      timelineSource: 'MatchTimelineProjection',
      timelineReadN: rows.projections.length,
      summarySource: 'MatchParticipant',
      filters: {
        ...effectiveFilters,
        mapId: 11,
        remakePolicy: 'included_descriptive',
      },
      matchIds: rows.matches.map((m) => m.matchId),
    });
    return {
      metricVersion: 1,
      hero: {
        puuid: heroPuuid,
        gameName: heroUser.gameName,
        stats: hero.stats,
        laningPhase: hero.laningPhase,
        cohort: cohort(heroRows),
      },
      villain: {
        puuid: villainPuuid,
        gameName: villainUser.gameName,
        stats: villain.stats,
        laningPhase: villain.laningPhase,
        cohort: cohort(villainRows),
      },
      timelineComparison: {
        csGraph: { hero: hero.csGraph, villain: villain.csGraph },
        goldGraph: { hero: hero.goldGraph, villain: villain.goldGraph },
      },
      insights: generateInsights(
        hero.stats,
        villain.stats,
        hero.laningPhase,
        villain.laningPhase,
      ),
    };
  }
}
