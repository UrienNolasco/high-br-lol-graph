import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jsonObject } from '../../../../core/prisma/json-value';
import type {
  MatchProjectionWrite,
  MatchProjectionWriter,
} from '../../ports/match-projection-writer';
import type { TransactionContext } from '../../../../lib/transaction-context';
import { fromTransactionContext } from '../../../../core/prisma/transaction-context';

/** Prisma adapter for the ordered match projection writes. */
@Injectable()
export class MatchProjectionPersistenceAdapter implements MatchProjectionWriter {
  async write(
    transaction: TransactionContext,
    input: MatchProjectionWrite,
  ): Promise<void> {
    const tx = fromTransactionContext(transaction);
    const { matchData, timeline, completedAt } = input;
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
        matchId: matchData.match.matchId,
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
  }
}
