import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
/** Technical transaction scope; business ports expose neither Prisma nor transaction handles. */
@Injectable()
export class ReadSnapshot {
  private readonly scope = new AsyncLocalStorage<Prisma.TransactionClient>();
  constructor(private readonly prisma: PrismaService) {}
  run<T>(read: () => Promise<T>): Promise<T> {
    if (this.scope.getStore()) return read();
    return this.prisma.$transaction((tx) => this.scope.run(tx, read), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    });
  }
  /** Only persistence adapters obtain the scoped client. */
  client(): Prisma.TransactionClient {
    const tx = this.scope.getStore();
    if (!tx) throw new Error('Read snapshot scope required');
    return tx;
  }
}
