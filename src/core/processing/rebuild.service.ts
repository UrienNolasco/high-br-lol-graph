import { PrismaService } from '../prisma/prisma.service';
import { WorkerService } from '../../modules/worker/services/worker.service';
import { PROCESSING_GATE, PROCESSING_VERSION } from './processing.constants';

/** Offline operation. Callers must stop the HTTP API before starting. */
export class RebuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: WorkerService,
  ) {}

  async run(resume = false, progress: (completed: number) => void = () => {}) {
    // A dedicated transaction holds only an advisory lock, not the data being rebuilt.
    // It prevents simultaneous CLI runs; commits/checkpoints happen per match.
    return this.prisma.$transaction(
      async (runner) => {
        const [lock] = await runner.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${PROCESSING_GATE + 1}) AS acquired`;
        if (!lock.acquired)
          throw new Error('Another rebuild command is running');
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PROCESSING_GATE})::text`;
            const state = await tx.processingMaintenance.findUnique({
              where: { id: 1 },
            });
            if (resume) {
              if (
                !state?.rebuilding ||
                state.targetVersion !== PROCESSING_VERSION
              ) {
                throw new Error(
                  'No rebuild of this processing version to resume',
                );
              }
            } else {
              if (state?.rebuilding)
                throw new Error('Rebuild interrupted: use --resume');
              const missing = await tx.matchProcessing.count({
                where: {
                  status: 'COMPLETED',
                  OR: [
                    { raw: null },
                    { raw: { summary: null } },
                    { raw: { timeline: null } },
                  ],
                },
              });
              if (missing)
                throw new Error(
                  'Completed matches are missing raw data; rebuild refused',
                );
              await tx.processingMaintenance.upsert({
                where: { id: 1 },
                create: {
                  id: 1,
                  rebuilding: true,
                  targetVersion: PROCESSING_VERSION,
                  startedAt: new Date(),
                },
                update: {
                  rebuilding: true,
                  targetVersion: PROCESSING_VERSION,
                  startedAt: new Date(),
                  completedAt: null,
                },
              });
              await tx.playerChampionStats.deleteMany();
              await tx.playerStats.deleteMany();
              await tx.championStats.deleteMany();
              await tx.match.deleteMany();
              await tx.matchProcessing.updateMany({
                data: {
                  status: 'PENDING',
                  attempts: 0,
                  processingVersion: null,
                  completedAt: null,
                  leaseToken: null,
                  leaseUntil: null,
                  nextAttemptAt: new Date(),
                  publishedAt: null,
                },
              });
            }
            // A previous offline worker can no longer be running: we own the runner lock.
            await tx.matchProcessing.updateMany({
              where: {
                status: { not: 'COMPLETED' },
                raw: { summary: { not: null }, timeline: { not: null } },
              },
              data: {
                status: 'PENDING',
                attempts: 0,
                leaseToken: null,
                leaseUntil: null,
                nextAttemptAt: new Date(),
                publishedAt: null,
              },
            });
          },
          { timeout: 30_000 },
        );

        let completed = 0;
        while (true) {
          const batch = await this.prisma.matchProcessing.findMany({
            where: {
              status: { not: 'COMPLETED' },
              raw: { summary: { not: null }, timeline: { not: null } },
            },
            orderBy: { matchId: 'asc' },
            take: 50,
            select: { matchId: true },
          });
          if (!batch.length) break;
          for (const job of batch) {
            await this.worker.processMatch({ matchId: job.matchId }, true);
            const result = await this.prisma.matchProcessing.findUniqueOrThrow({
              where: { matchId: job.matchId },
            });
            if (result.status !== 'COMPLETED')
              throw new Error(`Rebuild did not complete ${job.matchId}`);
            progress(++completed);
          }
        }
        await this.prisma.processingMaintenance.update({
          where: { id: 1 },
          data: { rebuilding: false, completedAt: new Date() },
        });
        return completed;
      },
      { timeout: 3_600_000, maxWait: 5000 },
    );
  }
}
