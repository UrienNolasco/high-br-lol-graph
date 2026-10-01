import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import { DATASET_VERSION } from '../../dataset/contracts/definition';
import { DATASET_PROCESSING_VERSION } from '../../dataset/contracts/processing';
import { DATASET_WINDOW_READER } from '../../dataset/ports/window-reader';
import type { DatasetWindowReader } from '../../dataset/ports/window-reader';
import { SEQUENCE_EXAMPLES_READER } from '../../matches/ports/sequence-examples-reader';
import type {
  SequenceExamplesReader,
  SequenceExample,
} from '../../matches/ports/sequence-examples-reader';
import {
  calculateEvolution,
  calculateEvolutionWindow,
} from '../evolution-calculator';
import {
  EvolutionQuery,
  EvolutionWindow,
  evolutionWindowFilters,
  EVOLUTION_MAX_ROWS_PER_WINDOW,
  EVOLUTION_MAX_EXAMPLE_MATCHES_PER_WINDOW,
  EVOLUTION_MAX_EXAMPLE_EVENTS,
  EVOLUTION_MAX_EXAMPLE_EPISODES,
} from '../evolution-contract';
/** Application orchestrator: owner ports, no ORM/delegate access. */
@Injectable()
export class EvolutionRepository {
  constructor(
    private readonly snapshot: ReadSnapshot,
    @Inject(DATASET_WINDOW_READER)
    private readonly dataset: DatasetWindowReader,
    @Inject(SEQUENCE_EXAMPLES_READER)
    private readonly matches: SequenceExamplesReader,
  ) {}
  getEvolution(query: EvolutionQuery) {
    return this.snapshot.run(async () => {
      const window = async (w: EvolutionWindow) => {
        const load = async (death: boolean) => {
          const result = await this.dataset.readWindow(
            evolutionWindowFilters(query, w, death),
            query.puuid,
            EVOLUTION_MAX_ROWS_PER_WINDOW,
          );
          if (result.rows.length > EVOLUTION_MAX_ROWS_PER_WINDOW)
            throw new UnprocessableEntityException(
              'Evolution window exceeds 1000 contributions; narrow dates',
            );
          return {
            ...result,
            rows: result.rows.map((r) => ({
              ...r,
              gameCreation: BigInt(r.gameCreation),
              processedAt: new Date(r.processedAt),
            })),
          };
        };
        const selected = await load(false),
          deaths = await load(true);
        const result = calculateEvolutionWindow(
          query,
          w,
          selected.rows,
          deaths.rows,
          await this.matches.countUnpublished(
            {
              playerId: query.puuid,
              championId: query.filters.championId!,
              role: query.filters.role!,
              queueId: query.filters.queueId!,
              mapId: query.filters.mapId!,
              patch: query.filters.patch,
              ...w,
            },
            selected.publishedMatchIds,
          ),
        );
        const sources = [
          ...new Map(
            deaths.rows.filter((r) => r.eligible).map((r) => [r.matchId, r]),
          ).values(),
        ];
        const items: SequenceExample[] = [];
        for (const row of sources.slice(
          0,
          EVOLUTION_MAX_EXAMPLE_MATCHES_PER_WINDOW,
        ))
          items.push(
            await this.matches.readExample({
              matchId: row.matchId,
              subjectId: query.puuid,
              processingVersion: row.processingVersion,
              processedAt: row.processedAt.toISOString(),
              eventLimit: EVOLUTION_MAX_EXAMPLE_EVENTS,
              episodeLimit: EVOLUTION_MAX_EXAMPLE_EPISODES,
            }),
          );
        return {
          ...result,
          examples: {
            selection:
              'first eligible matches ordered gameCreation/matchId; descriptive examples, not representative',
            candidateMatches: sources.length,
            returnedMatches: items.length,
            truncated: sources.length > items.length,
            items,
          },
        };
      };
      const baseline = await window(query.baseline),
        recent = await window(query.recent);
      return {
        datasetVersion: DATASET_VERSION,
        processingVersion: DATASET_PROCESSING_VERSION,
        ...calculateEvolution(query, baseline, recent),
      };
    });
  }
}
