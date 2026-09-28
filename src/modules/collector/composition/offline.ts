import type { PrismaService } from '../../../core/prisma/prisma.service';
import { DiscoveryReportService } from '../services/discovery-report.service';

/** Public offline composition: no cron, Riot, Redis, Rabbit or worker graph. */
export function createOfflineDiscoveryReport(prisma: PrismaService) {
  return new DiscoveryReportService(prisma);
}
