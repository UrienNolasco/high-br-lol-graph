import { Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import type {
  PlayerOutcomeScope,
  PlayerOutcomeReader,
} from '../ports/player-outcome-reader';
import {
  DATASET_VERSION,
  DATASET_DEFINITION_MAP,
} from '../contracts/definition';
import { DATASET_PROCESSING_VERSION } from '../contracts/processing';
function where(scope: PlayerOutcomeScope) {
  return {
    datasetVersion: DATASET_VERSION,
    processingVersion: DATASET_PROCESSING_VERSION,
    definitionId: 'label.win',
    definitionVersion: DATASET_DEFINITION_MAP.get('label.win')!.version,
    subjectKind: 'participant',
    subjectId: scope.playerId,
    horizonKey: 'final',
    queueId: scope.queueId,
    mapId: scope.mapId,
    gameCreation: { gte: BigInt(scope.fromMs), lt: BigInt(scope.toMs) },
  };
}
@Injectable()
export class PlayerOutcomePersistenceReader implements PlayerOutcomeReader {
  constructor(private readonly snapshot: ReadSnapshot) {}
  async read(scope: PlayerOutcomeScope, maximum: number) {
    const tx = this.snapshot.client();
    const filter = where(scope);
    const total = await tx.historicalMetricContribution.count({
      where: filter,
    });
    const tooLarge = total > maximum;
    const anchors = tooLarge
      ? []
      : await tx.historicalMetricContribution.findMany({
          where: filter,
          orderBy: [{ gameCreation: 'asc' }, { matchId: 'asc' }],
          take: maximum,
          select: {
            id: true,
            matchId: true,
            gameCreation: true,
            championId: true,
            role: true,
            patch: true,
            eligible: true,
            validCount: true,
            value: true,
            exclusionReason: true,
          },
        });
    return {
      anchors,
      total,
      tooLarge,
      datasetVersion: DATASET_VERSION,
      processingVersion: DATASET_PROCESSING_VERSION,
    };
  }
  async matchIds(scope: PlayerOutcomeScope) {
    const rows = await this.snapshot
      .client()
      .historicalMetricContribution.findMany({
        where: where(scope),
        select: { matchId: true },
        distinct: ['matchId'],
      });
    return rows.map((r) => r.matchId);
  }
}
