import { presentDeathResourceSummary } from './review/review-presenter';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MATCH_REVIEW_READER,
  type MatchReviewReader,
} from '../ports/match-review-reader';
import { MatchReviewQueryDto } from '../dto/match-review.dto';
import {
  calculateMatchReview,
  type MatchReview,
} from '../pure/review/match-review-calculator';

export const reviewBase = (matchId: string, puuid: string) =>
  `/api/v1/matches/${encodeURIComponent(matchId)}/review/${encodeURIComponent(puuid)}`;
@Injectable()
export class MatchReviewService {
  constructor(
    @Inject(MATCH_REVIEW_READER) private readonly reader: MatchReviewReader,
  ) {}
  private async load(matchId: string, puuid: string): Promise<MatchReview> {
    const input = await this.reader.findReview(matchId, puuid);
    if (!input || !input.participants.some((p) => p.puuid === puuid))
      throw new NotFoundException('Match or participant not found');
    return calculateMatchReview(input, puuid);
  }
  private metadata(report: MatchReview) {
    return {
      matchId: report.matchId,
      puuid: report.puuid,
      metricVersion: report.metricVersion,
      processingVersion: report.processingVersion,
      processedAt: report.processedAt,
      reason: report.reason,
      participant: report.participant,
      opponent: report.resources.opponent,
      observationContract: {
        horizonMs: report.resources.horizonMs,
        maxFrameAgeMs: report.resources.maxFrameAgeMs,
        mode: 'pastOnly',
      },
      coverage: report.coverage,
    };
  }
  private options(query: MatchReviewQueryDto) {
    const options = Object.assign(new MatchReviewQueryDto(), query);
    if (
      options.fromMs !== undefined &&
      options.toMs !== undefined &&
      options.fromMs >= options.toMs
    )
      throw new BadRequestException('fromMs must be less than toMs');
    return options;
  }
  async overview(matchId: string, puuid: string) {
    const r = await this.load(matchId, puuid),
      base = reviewBase(matchId, puuid);
    return {
      ...this.metadata(r),
      source: r.source,
      temporalScope: r.temporalScope,
      interpretation: r.interpretation,
      summary: {
        resourcesReason: r.resources.reason,
        deathEpisodes: r.coverage.combat ? null : r.resources.episodes.length,
        eligibleDeathEpisodes: r.resources.reason
          ? null
          : r.resources.episodes.filter((e) => e.eligible).length,
        damageReason: r.damage.reason,
        damageComplete: r.damage.complete,
        damageIntervals: r.damage.available ? r.damage.intervals.length : null,
        totalDamage: r.damage.totalDamage,
        damageWithoutDeaths: r.damage.damageWithoutDeaths,
        fractionWithoutDeaths: r.damage.fractionWithoutDeaths,
        rankingReason: r.damage.rankingReason,
        recapCoverage: r.recaps.coverage,
        recapReason: r.recaps.reason,
      },
      highlights: {
        personalPeak: r.damage.personalPeak,
        personalPeakWithoutDeaths: r.damage.personalPeakWithoutDeaths,
        globalPeakWithoutDeaths: r.damage.globalPeakWithoutDeaths,
      },
      links: {
        deaths: `${base}/deaths`,
        damage: `${base}/damage`,
        report: `/api/v1/matches/${encodeURIComponent(matchId)}/report/${encodeURIComponent(puuid)}`,
      },
    };
  }
  private paginated<T>(
    r: MatchReview,
    rows: T[],
    query: MatchReviewQueryDto,
    path: string,
  ) {
    const o = this.options(query),
      nextOffset = o.offset + o.limit;
    const params = new URLSearchParams({
      offset: String(nextOffset),
      limit: String(o.limit),
      sort: o.sort,
      deaths: o.deaths,
    });
    if (o.fromMs !== undefined) params.set('fromMs', String(o.fromMs));
    if (o.toMs !== undefined) params.set('toMs', String(o.toMs));
    return {
      ...this.metadata(r),
      items: rows.slice(o.offset, nextOffset),
      total: rows.length,
      offset: o.offset,
      limit: o.limit,
      hasMore: nextOffset < rows.length,
      next: nextOffset < rows.length ? `${path}?${params}` : null,
      filters: {
        fromMs: o.fromMs ?? null,
        toMs: o.toMs ?? null,
        sort: o.sort,
        deaths: o.deaths,
        appliedTo:
          'presentation_only; original denominators and ranks retained',
      },
    };
  }
  async deaths(matchId: string, puuid: string, query: MatchReviewQueryDto) {
    const o = this.options(query),
      r = await this.load(matchId, puuid),
      base = reviewBase(matchId, puuid);
    const rows = r.resources.episodes
      .filter(
        (e) =>
          (o.fromMs === undefined || e.deathMs >= o.fromMs) &&
          (o.toMs === undefined || e.deathMs < o.toMs),
      )
      .map((e) =>
        presentDeathResourceSummary(
          e,
          `${base}/deaths/${encodeURIComponent(e.eventId)}`,
          r.recaps.deaths.some((d) => d.eventId === e.eventId && d.available),
        ),
      );
    return {
      ...this.paginated(r, rows, o, `${base}/deaths`),
      reason: r.resources.reason ?? r.reason,
    };
  }
  async death(matchId: string, puuid: string, eventId: string) {
    const r = await this.load(matchId, puuid);
    const resources =
      r.resources.episodes.find((e) => e.eventId === eventId) ?? null;
    const recap = r.recaps.deaths.find((e) => e.eventId === eventId) ?? null;
    if (!resources && !recap)
      throw new NotFoundException('Death not found for this participant');
    return {
      ...this.metadata(r),
      eventId,
      resources,
      recap,
      interpretation: r.interpretation,
    };
  }
  async damage(matchId: string, puuid: string, query: MatchReviewQueryDto) {
    const o = this.options(query),
      r = await this.load(matchId, puuid),
      base = reviewBase(matchId, puuid);
    const rows = r.damage.intervals.filter(
      (e) =>
        (o.fromMs === undefined || e.startMs >= o.fromMs) &&
        (o.toMs === undefined || e.startMs < o.toMs) &&
        (o.deaths === 'all' ||
          (o.deaths === 'none' ? e.noDeaths === true : e.noDeaths === false)),
    );
    if (o.sort === 'damage')
      rows.sort(
        (a, b) =>
          (b.personalRate.value ?? -1) - (a.personalRate.value ?? -1) ||
          a.startMs - b.startMs,
      );
    return {
      ...this.paginated(r, rows, o, `${base}/damage`),
      reason: r.damage.reason ?? r.reason,
      complete: r.damage.complete,
      rankingReason: r.damage.rankingReason,
    };
  }
}
