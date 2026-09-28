import 'reflect-metadata';
import { PrismaService } from './core/prisma/prisma.service';
import { ProcessingService } from './core/processing/processing.service';
import { createOfflineDiscoveryReport } from './modules/collector/composition/offline';

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
    const processing = new ProcessingService(prisma);
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
      console.log(
        await processing.retryFailed(args[0] === '--all' ? undefined : args[0]),
      );
    } else {
      // Rebuild is the only command that loads the worker graph. Coverage,
      // lineage, status and retry remain offline composition paths.
      const { RebuildService } = await import(
        './core/processing/rebuild.service.js'
      );
      const { PlayerStatsAggregationService } = await import(
        './modules/stats/adapters/persistence/player-stats-writer.js'
      );
      const { MatchPersistenceService } = await import(
        './modules/worker/services/match-persistence.service.js'
      );
      const { WorkerService } = await import(
        './modules/worker/services/worker.service.js'
      );
      const { TimelineParserService } = await import(
        './modules/matches/adapters/riot/timeline-parser.service.js'
      );
      const { PinoLogger } = await import('nestjs-pino');
      type RiotOfflineSource = ConstructorParameters<typeof WorkerService>[0];
      const logger = new PinoLogger({});
      const persistence = new MatchPersistenceService(
        prisma,
        processing,
        new PlayerStatsAggregationService(),
      );
      // Explicit offline source: the CLI never bootstraps HTTP, Redis, RabbitMQ or collectors.
      const offlineRiot = {
        getMatchById: () => {
          throw new Error('Offline rebuild attempted HTTP');
        },
        getTimeline: () => {
          throw new Error('Offline rebuild attempted HTTP');
        },
      } as unknown as RiotOfflineSource;
      const worker = new WorkerService(
        offlineRiot,
        new TimelineParserService(),
        persistence,
        processing,
        logger,
      );
      const count = await new RebuildService(prisma, worker).run(
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
