import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { jsonObject } from '../../../core/prisma/json-value';
import {
  ProcessingService,
  ProcessingLease,
} from '../../../core/processing/processing.service';
import { PROCESSING_VERSION } from '../../../core/processing/processing.constants';
import { PlayerStatsAggregationService } from '../../../core/stats/player-stats-aggregation.service';
import type { ProcessedMatchData } from '../../matches/contracts/normalized-match';
import type { ParsedTimelineData } from '../../matches/contracts/normalized-timeline';
import { TimelineDto } from '../../../core/riot/dto/timeline.dto';
import {
  replaceHistoricalDataset,
  prepareHistoricalDataset,
} from '../../../core/dataset/dataset-persistence';
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
    const datasetInput = {
      ...matchData,
      projection: timeline.snapshotProjection,
      events: timeline.normalizedEvents,
      processingVersion: PROCESSING_VERSION,
      processedAt: new Date(),
    };
    const preparedDataset = prepareHistoricalDataset(datasetInput);
    await this.prisma.$transaction(
      async (tx) => {
        if (!(await this.processing.gate(tx, offline)))
          throw new Error('Rebuild in progress');
        await this.processing.lockLease(tx, lease);
        const completedAt = new Date();
        await tx.match.create({
          data: {
            ...matchData.match,
            finalContext: jsonObject(matchData.match.finalContext),
          },
        });
        await tx.matchTeam.createMany({
          data: matchData.teams.map((team) => ({
            ...team,
            finalObjectives: jsonObject(team.finalObjectives),
            objectivesTimeline: timeline.objectivesTimeline
              .filter((event) => event.teamId === team.teamId)
              .map(jsonObject),
          })),
        });
        await tx.matchParticipant.createMany({
          data: matchData.participants.map((participant) => {
            const tp = timeline.participants.get(participant.puuid)!;
            return {
              ...participant,
              finalStats: jsonObject(participant.finalStats),
              finalInventory: jsonObject(participant.finalInventory),
              runes: jsonObject(participant.runes),
              challenges: jsonObject(participant.challenges),
              pings: jsonObject(participant.pings),
              goldGraph: tp.goldGraph,
              xpGraph: tp.xpGraph,
              csGraph: tp.csGraph,
              damageGraph: tp.damageGraph,
              deathPositions: tp.deathPositions.map(jsonObject),
              killPositions: tp.killPositions.map(jsonObject),
              wardPositions: tp.wardPositions.map(jsonObject),
              pathingSample: tp.pathingSample.map(jsonObject),
              skillOrder: tp.skillOrder,
              itemTimeline: tp.itemTimeline.map(jsonObject),
            };
          }),
        });
        await tx.matchTimelineProjection.create({
          data: {
            matchId: lease.matchId,
            projectionVersion: timeline.snapshotProjection.projectionVersion,
            frameIntervalMs: timeline.snapshotProjection.frameIntervalMs,
            observedEndMs: timeline.snapshotProjection.observedEndMs,
            frames: timeline.snapshotProjection.frames.map(jsonObject),
          },
        });
        await tx.matchEventProjection.createMany({
          data: timeline.normalizedEvents.map((event) => ({
            ...event,
            processedAt: completedAt,
            assistingParticipantIds:
              event.assistingParticipantIds ?? Prisma.DbNull,
            assistingPuuids: event.assistingPuuids ?? Prisma.DbNull,
            payload: jsonObject(event.payload),
            quality: jsonObject(event.quality),
          })),
        });
        await replaceHistoricalDataset(
          tx,
          { ...datasetInput, processedAt: completedAt },
          preparedDataset,
        );
        // Shared aggregate rows are locked only after independent per-match writes finish.
        await this.aggregates.update(tx, matchData, raw);
        await tx.matchProcessing.update({
          where: { matchId: lease.matchId },
          data: {
            status: 'COMPLETED',
            completedAt,
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
