import { Inject, Injectable } from '@nestjs/common';
import type { DiscoveryContext } from '../contracts/discovery';
import {
  INGESTION_TRANSACTION_COORDINATOR,
  type DiscoveryRecorder,
  type ObservationRequest,
  type IngestionTransactionCoordinator,
} from '../../../core/processing/contracts/request-ingestion';
import {
  OBSERVATION_WRITER,
  type ObservationWriter,
} from '../ports/observation-writer';

/** Collector application service: observation and edges share the gate/tx. */
@Injectable()
export class DiscoveryService implements DiscoveryRecorder {
  constructor(
    @Inject(INGESTION_TRANSACTION_COORDINATOR)
    private readonly ingestion: IngestionTransactionCoordinator,
    @Inject(OBSERVATION_WRITER)
    private readonly writer: ObservationWriter,
  ) {}

  recordObservation(
    matchIds: readonly string[],
    context: DiscoveryContext,
  ): Promise<void> {
    return this.ingestion.withIngestionTransaction((transaction) =>
      this.writer.recordObservation(matchIds, context, transaction),
    );
  }

  /** Explicit boundary mapping from processing's DTO to collector context. */
  recordDiscovery(request: ObservationRequest): Promise<void> {
    const context: DiscoveryContext = {
      observationId: request.observationId,
      source: request.source,
      observedAt: request.observedAt,
      region: request.region,
      queriedPuuid: request.queriedPuuid,
      queueFilter: request.queueFilter,
      requestedCount: request.requestedCount,
      startIndex: request.startIndex,
      rank: request.rank ? { ...request.rank } : null,
    };
    return this.recordObservation(request.matchIds, context);
  }
}
