import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { discoveryData, type DiscoveryContext } from '../contracts/discovery';
import type { ObservationWriter } from '../ports/observation-writer';
import type {
  ObservationLineage,
  ObservationReader,
} from '../../../core/processing/ports/observation-reader';
import type { TransactionContext } from '../../../lib/transaction-context';
import { getPrismaTransaction } from '../../../core/prisma/transaction-context';

@Injectable()
export class CollectorRepository
  implements ObservationWriter, ObservationReader
{
  constructor(private readonly prisma: PrismaService) {}

  async matchExists(matchId: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({
      where: { matchId },
      select: { matchId: true },
    });
    return !!match;
  }

  async recordObservation(
    matchIds: readonly string[],
    context: DiscoveryContext,
    transaction: TransactionContext,
  ): Promise<void> {
    const data = discoveryData(context, matchIds);
    const tx = getPrismaTransaction(transaction);
    await tx.discoveryObservation.upsert({
      where: { id: data.id },
      create: data,
      // Observation IDs are immutable. A retry with the same UUID is a no-op.
      update: {},
    });
  }

  async readLineage(
    matchId: string,
    transaction: TransactionContext,
  ): Promise<ObservationLineage> {
    const tx = getPrismaTransaction(transaction);
    const observations = await tx.discoveryObservation.findMany({
      where: { matches: { some: { matchId } } },
      select: { id: true, source: true, observedAt: true },
      orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    });
    const observationIds = observations.map((row) => row.id);
    const sources = [...new Set(observations.map((row) => row.source))].sort();
    return {
      observationIds,
      sources,
      status: observationIds.length ? 'observed' : 'unknown',
      reason: observationIds.length ? null : 'missing_discovery_observation',
    };
  }
}
