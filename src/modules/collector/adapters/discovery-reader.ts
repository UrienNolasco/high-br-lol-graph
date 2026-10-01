import { Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../core/prisma/read-snapshot';
import type {
  DiscoveryPeriod,
  DiscoveryReader,
} from '../contracts/discovery-reader';
@Injectable()
export class DiscoveryPersistenceReader implements DiscoveryReader {
  constructor(private readonly snapshot: ReadSnapshot) {}
  async matchIds(scope: DiscoveryPeriod) {
    const rows = await this.snapshot.client().matchDiscovery.findMany({
      where: {
        observation: {
          queriedPuuid: scope.playerId,
          observedAt: { gte: new Date(scope.fromMs), lt: new Date(scope.toMs) },
        },
      },
      select: { matchId: true },
      distinct: ['matchId'],
    });
    return rows.map((r) => r.matchId);
  }
}
