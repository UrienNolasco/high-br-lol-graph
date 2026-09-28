import { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { RawMatchSource } from '../modules/processing/ports/raw-match-source';
import {
  createProcessingComposition,
  type ProcessingComposition,
} from './processing';

export function storedOnlyRawMatchSource(): RawMatchSource {
  return {
    getMatchById: async () => {
      throw new Error('Offline processing attempted external match fetch');
    },
    getTimeline: async () => {
      throw new Error('Offline processing attempted external timeline fetch');
    },
  };
}

export function createOfflineProcessingComposition(
  prisma: PrismaService,
  logger = new PinoLogger({}),
): ProcessingComposition {
  return createProcessingComposition({
    prisma,
    source: storedOnlyRawMatchSource(),
    logger,
  });
}
