/**
 * Stable entrypoints for offline studies and benchmark scripts.
 *
 * Scripts are tooling, so they may depend on this composition boundary. The
 * boundary owns wiring application services and adapters without making the
 * scripts know their internal module layout.
 */
export { parseMatchData } from '../modules/matches/adapters/riot/match.parser';
export { normalizeTimelineEvents } from '../modules/matches/adapters/riot/normalized-events';
export { projectTimelineSnapshots } from '../modules/matches/adapters/riot/timeline-snapshots';
export {
  projectFinalStats,
  projectFinalObjectives,
} from '../modules/matches/adapters/riot/final-stats';
export { MatchReportService } from '../modules/matches/services/match-report.service';
export { MatchReportController } from '../modules/matches/match-report.controller';
export { ReportRepository } from '../modules/matches/repositories/report.repository';
export { MatchReportQueryDto } from '../modules/matches/dto/match-report-query.dto';
export { DataDragonService } from '../core/data-dragon/data-dragon.service';
export {
  calculateBountiesSteals,
  STEAL_CHALLENGES,
} from '../modules/matches/contracts/calculations/bounties-steals';
export { calculateEconomy } from '../modules/matches/contracts/calculations/economy';
export { calculateKillEpisodes } from '../modules/matches/contracts/calculations/kill-episodes';
export { calculateMapPresence } from '../modules/matches/contracts/calculations/map-presence';
export { calculateObjectives } from '../modules/matches/contracts/calculations/objectives';
export { calculateSequences } from '../modules/matches/contracts/calculations/sequences';
export { calculateVision } from '../modules/matches/contracts/calculations/vision';
export { computeContribution } from '../modules/matches/contracts/calculations/contribution';
export { PROCESSING_VERSION } from '../modules/processing/contracts/processing.constants';
export {
  championDto,
  toChampionMetrics,
} from '../modules/stats/services/champion.enricher';
export { TierRankService } from '../modules/stats/services/tier-rank.service';
export { WorkerService } from '../modules/worker/services/worker.service';
export { calculateIndicators } from '../modules/indicators/pure/indicator-calculator';
export {
  indicatorCatalog,
  INDICATOR_CATALOG,
} from '../modules/indicators/pure/indicator-catalog';
export { summarizeIndicatorHistory } from '../modules/indicators/pure/indicator-history';
export { buildHistoricalDataset } from '../modules/dataset/pure/dataset-builder';
export { calculateReference } from '../modules/references/reference-calculator';
export type { ReferenceRow } from '../modules/references/reference-calculator';
export { normalizeReferenceQuery } from '../modules/references/reference-contract';
export { visionInvestmentContext } from '../modules/references/contracts/statistics';
