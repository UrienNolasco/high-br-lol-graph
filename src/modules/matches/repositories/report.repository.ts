import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ReportInput, record } from '../pure/report/report.types';
export const REPORT_READ_LIMITS = { events: 10000, frames: 300 } as const;
@Injectable()
export class ReportRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findReport(
    matchId: string,
    puuid: string,
  ): Promise<ReportInput | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            gameCreation: true,
            gameDuration: true,
            gameVersion: true,
            mapId: true,
            queueId: true,
            finalContext: true,
            participants: {
              select: {
                puuid: true,
                riotIdGameName: true,
                riotIdTagline: true,
                championId: true,
                championName: true,
                teamId: true,
                role: true,
                win: true,
                kills: true,
                deaths: true,
                assists: true,
                kda: true,
                finalStats: true,
                finalInventory: true,
              },
              orderBy: { puuid: 'asc' },
            },
            teams: {
              select: { teamId: true, win: true, finalObjectives: true },
              orderBy: { teamId: 'asc' },
            },
            timelineProjection: true,
          },
        });
        if (!match || !match.participants.some((p) => p.puuid === puuid))
          return null;
        const [rows, processing] = await Promise.all([
          tx.matchEventProjection.findMany({
            where: { matchId },
            orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
            take: REPORT_READ_LIMITS.events + 1,
          }),
          tx.matchProcessing.findUnique({
            where: { matchId },
            select: {
              status: true,
              processingVersion: true,
              completedAt: true,
            },
          }),
        ]);
        const frames = record(match.timelineProjection).frames;
        return {
          ...match,
          events: rows.slice(0, REPORT_READ_LIMITS.events),
          processing,
          readLimits: {
            eventLimit: REPORT_READ_LIMITS.events,
            eventRows: rows.length,
            eventsTruncated: rows.length > REPORT_READ_LIMITS.events,
            frameLimit: REPORT_READ_LIMITS.frames,
            frameRows: Array.isArray(frames) ? frames.length : 0,
            framesTruncated:
              Array.isArray(frames) &&
              frames.length > REPORT_READ_LIMITS.frames,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
