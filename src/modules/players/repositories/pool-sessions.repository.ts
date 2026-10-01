import { Inject, Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import {
  PLAYER_OUTCOME_READER,
  type PlayerOutcomeReader,
} from '../../dataset/ports/player-outcome-reader';
import {
  PLAYER_HISTORY_COVERAGE_READER,
  type PlayerHistoryCoverageReader,
} from '../../matches/ports/player-history-coverage-reader';
import {
  DISCOVERY_READER,
  type DiscoveryReader,
} from '../../collector/contracts/discovery-reader';
import type {
  PoolSessionQuery,
  PoolSessionRow,
} from '../contracts/pool-sessions';
import { calculatePoolSessions } from '../domain/pool-sessions';
import { normalizeRole } from '../../matches/contracts/eligibility';
export const POOL_SESSION_MAX_MATCHES = 10000;
/** Application orchestration only; owner ports handle all persisted data. */
@Injectable()
export class PoolSessionsRepository {
  constructor(
    private readonly snapshot: ReadSnapshot,
    @Inject(PLAYER_OUTCOME_READER)
    private readonly outcomes: PlayerOutcomeReader,
    @Inject(PLAYER_HISTORY_COVERAGE_READER)
    private readonly matches: PlayerHistoryCoverageReader,
    @Inject(DISCOVERY_READER) private readonly discovery: DiscoveryReader,
  ) {}
  analyze(query: PoolSessionQuery) {
    return this.snapshot.run(async () => {
      const page = await this.outcomes.read(query, POOL_SESSION_MAX_MATCHES);
      const materializedIds = page.tooLarge
        ? await this.outcomes.matchIds(query)
        : page.anchors.map((r) => r.matchId);
      const unmaterialized = await this.matches.countWithoutAnchors(
        query,
        materializedIds,
      );
      const durations = new Map(
        (await this.matches.durations(page.anchors.map((r) => r.matchId))).map(
          (r) => [r.matchId, r.durationSeconds],
        ),
      );
      const discovered = [...new Set(await this.discovery.matchIds(query))];
      const existing = new Set(await this.matches.existingIds(discovered));
      const missingDiscovered = discovered.filter(
        (id) => !existing.has(id),
      ).length;
      const rows: PoolSessionRow[] = page.anchors.map((r) => ({
        matchId: r.matchId,
        gameCreationMs: Number(r.gameCreation),
        durationSeconds: durations.get(r.matchId) ?? 0,
        championId: r.championId,
        role: normalizeRole(r.role),
        patch: r.patch,
        eligible: r.eligible,
        win:
          r.validCount === 1 && (r.value === 0 || r.value === 1)
            ? r.value
            : null,
        exclusionReason: r.exclusionReason,
        evidenceId: r.id,
      }));
      return {
        datasetVersion: page.datasetVersion,
        processingVersion: page.processingVersion,
        maximumCandidateMatches: POOL_SESSION_MAX_MATCHES,
        discoveryGaps: {
          discoveredUnimportedMatches: missingDiscovered,
          status: missingDiscovered
            ? 'incomplete_import'
            : 'unknown_collection_completeness',
          scope:
            'Distinct missing match IDs discovered for player in observedAt [fromMs,toMs); their gameCreation/queue/map are unknown, so this is separate from the gameCreation cohort',
        },
        ...calculatePoolSessions(
          query,
          rows,
          unmaterialized,
          page.tooLarge,
          page.total,
        ),
      };
    });
  }
}
