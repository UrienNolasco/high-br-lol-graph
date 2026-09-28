import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { bindPrismaTransaction } from '../../../core/prisma/transaction-context';
import type { TransactionContext } from '../../../lib/transaction-context';
import type { IngestionTransactionCoordinator } from '../../processing/contracts/request-ingestion';
import {
  CONTROL_TRANSACTION_OPTIONS,
  PROCESSING_GATE,
} from '../../processing/contracts/processing.constants';

/** Side-effect-free transaction gate used by collector observation writes. */
@Injectable()
export class IngestionTransactionService
  implements IngestionTransactionCoordinator
{
  constructor(private readonly prisma: PrismaService) {}

  withIngestionTransaction<T>(
    callback: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(${PROCESSING_GATE})::text`;
      const maintenance = await tx.processingMaintenance.findUnique({
        where: { id: 1 },
      });
      if (maintenance?.rebuilding)
        throw new Error('Rebuild in progress; ingestion is paused');
      return callback(bindPrismaTransaction(tx));
    }, CONTROL_TRANSACTION_OPTIONS);
  }
}
