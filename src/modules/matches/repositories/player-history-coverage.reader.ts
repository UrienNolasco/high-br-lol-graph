import { Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import type {
  PlayerHistoryCoverageReader,
  PlayerHistoryScope,
} from '../ports/player-history-coverage-reader';
@Injectable()
export class PlayerHistoryCoveragePersistenceReader
  implements PlayerHistoryCoverageReader
{
  constructor(private readonly snapshot: ReadSnapshot) {}
  async durations(matchIds: readonly string[]) {
    const rows = await this.snapshot.client().match.findMany({
      where: { matchId: { in: [...matchIds] } },
      select: { matchId: true, gameDuration: true },
    });
    return rows.map((r) => ({
      matchId: r.matchId,
      durationSeconds: r.gameDuration,
    }));
  }
  countWithoutAnchors(
    scope: PlayerHistoryScope,
    materializedIds: readonly string[],
  ) {
    return this.snapshot.client().match.count({
      where: {
        queueId: scope.queueId,
        mapId: scope.mapId,
        gameCreation: { gte: BigInt(scope.fromMs), lt: BigInt(scope.toMs) },
        participants: { some: { puuid: scope.playerId } },
        matchId: { notIn: [...materializedIds] },
      },
    });
  }
  async existingIds(matchIds: readonly string[]) {
    const rows = await this.snapshot.client().match.findMany({
      where: { matchId: { in: [...matchIds] } },
      select: { matchId: true },
    });
    return rows.map((r) => r.matchId);
  }
}
