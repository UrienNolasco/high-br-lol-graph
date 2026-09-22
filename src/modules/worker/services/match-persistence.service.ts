import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ProcessingService,
  ProcessingLease,
} from '../../../core/processing/processing.service';
import { PROCESSING_VERSION } from '../../../core/processing/processing.constants';
import { PlayerStatsAggregationService } from '../../../core/stats/player-stats-aggregation.service';
import { ProcessedMatchData } from '../pure/match.parser';
import { ParsedTimelineData } from '../../../core/riot/timeline-parser.service';
import { TimelineDto } from '../../../core/riot/dto/timeline.dto';
@Injectable()
export class MatchPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processing: ProcessingService,
    private readonly aggregates: PlayerStatsAggregationService,
  ) {}
  async save(
    lease: ProcessingLease,
    matchData: ProcessedMatchData,
    timeline: ParsedTimelineData,
    raw: TimelineDto,
    offline = false,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        if (!(await this.processing.gate(tx, offline)))
          throw new Error('Rebuild in progress');
        await this.processing.lockLease(tx, lease);
        await tx.match.create({ data: matchData.match });
        await tx.matchTeam.createMany({
          data: matchData.teams.map((team) => ({
            ...team,
            objectivesTimeline: timeline.objectivesTimeline.filter(
              (event) => event.teamId === team.teamId,
            ) as unknown as Prisma.InputJsonValue,
          })),
        });
        await tx.matchParticipant.createMany({
          data: matchData.participants.map((participant) => {
            const tp = timeline.participants.get(participant.puuid)!;
            return {
              ...participant,
              goldGraph: tp.goldGraph,
              xpGraph: tp.xpGraph,
              csGraph: tp.csGraph,
              damageGraph: tp.damageGraph,
              deathPositions:
                tp.deathPositions as unknown as Prisma.InputJsonValue,
              killPositions:
                tp.killPositions as unknown as Prisma.InputJsonValue,
              wardPositions:
                tp.wardPositions as unknown as Prisma.InputJsonValue,
              pathingSample:
                tp.pathingSample as unknown as Prisma.InputJsonValue,
              skillOrder: tp.skillOrder,
              itemTimeline: tp.itemTimeline as unknown as Prisma.InputJsonValue,
            };
          }),
        });
        await this.aggregates.update(tx, matchData, raw);
        await tx.matchProcessing.update({
          where: { matchId: lease.matchId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            processingVersion: PROCESSING_VERSION,
            lastError: null,
            leaseToken: null,
            leaseUntil: null,
          },
        });
      },
      { timeout: 30_000 },
    );
  }
}
