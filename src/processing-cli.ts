import 'reflect-metadata';
import { PrismaService } from './core/prisma/prisma.service';
import { createOfflineDiscoveryReport } from './modules/collector/composition/offline';
import { createOfflineProcessingComposition } from './composition/offline-processing';
import { PinoLogger } from 'nestjs-pino';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (
    !['status', 'retry', 'rebuild', 'coverage', 'lineage'].includes(command) ||
    (command === 'rebuild' && args.some((arg) => arg !== '--resume')) ||
    (command === 'retry' &&
      (args.length !== 1 ||
        (!/^BR1_\d+$/.test(args[0]) && args[0] !== '--all'))) ||
    (['status', 'coverage'].includes(command) && args.length) ||
    (command === 'lineage' &&
      (args.length !== 1 || !/^[A-Z0-9]+_\d+$/.test(args[0])))
  ) {
    throw new Error(
      'Usage: npm run processing -- status | coverage | lineage <matchId> | retry <BR1_id|--all> | rebuild [--resume]',
    );
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    if (command === 'coverage') {
      console.log(
        JSON.stringify(
          await createOfflineDiscoveryReport(prisma).coverage(),
          null,
          2,
        ),
      );
    } else if (command === 'lineage') {
      console.log(
        JSON.stringify(
          await createOfflineDiscoveryReport(prisma).lineage(args[0]),
          null,
          2,
        ),
      );
    } else if (command === 'status') {
      const states = await prisma.matchProcessing.groupBy({
        by: ['status'],
        _count: true,
      });
      const maintenance = await prisma.processingMaintenance.findUnique({
        where: { id: 1 },
      });
      const failures = await prisma.matchProcessing.findMany({
        where: { status: 'FAILED' },
        take: 20,
        orderBy: { updatedAt: 'desc' },
        select: { matchId: true, attempts: true, lastError: true },
      });
      console.log(JSON.stringify({ states, maintenance, failures }, null, 2));
    } else if (command === 'retry') {
      const { processing } = createOfflineProcessingComposition(
        prisma,
        new PinoLogger({}),
      );
      console.log(
        await processing.retryFailed(args[0] === '--all' ? undefined : args[0]),
      );
    } else {
      const { rebuild } = createOfflineProcessingComposition(
        prisma,
        new PinoLogger({}),
      );
      const count = await rebuild.run(
        args.includes('--resume'),
        (completed) =>
          console.log(JSON.stringify({ event: 'rebuild_progress', completed })),
      );
      console.log(
        JSON.stringify({ event: 'rebuild_completed', completed: count }),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
