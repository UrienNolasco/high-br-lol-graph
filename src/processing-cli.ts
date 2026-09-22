import 'reflect-metadata';
import { PrismaService } from './core/prisma/prisma.service';
import { ProcessingService } from './core/processing/processing.service';
import { RebuildService } from './core/processing/rebuild.service';
import { PlayerStatsAggregationService } from './core/stats/player-stats-aggregation.service';
import { MatchPersistenceService } from './modules/worker/services/match-persistence.service';
import { WorkerService } from './modules/worker/services/worker.service';
import { TimelineParserService } from './core/riot/timeline-parser.service';
import { RiotService } from './core/riot/riot.service';
import { PinoLogger } from 'nestjs-pino';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (
    !['status', 'retry', 'rebuild'].includes(command) ||
    (command === 'rebuild' && args.some((arg) => arg !== '--resume')) ||
    (command === 'retry' &&
      (args.length !== 1 ||
        (!/^BR1_\d+$/.test(args[0]) && args[0] !== '--all'))) ||
    (command === 'status' && args.length)
  ) {
    throw new Error(
      'Usage: npm run processing -- status | retry <BR1_id|--all> | rebuild [--resume]',
    );
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const processing = new ProcessingService(prisma);
    if (command === 'status') {
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
      } as unknown as RiotService;
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
