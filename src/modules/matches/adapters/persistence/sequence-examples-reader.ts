import { Injectable } from '@nestjs/common';
import { ReadSnapshot } from '../../../../core/prisma/read-snapshot';
import { calculateSequences } from '../../contracts/calculations/sequences';
import { readSnapshotProjection } from '../../contracts/snapshot-readers';
import type {
  SequenceExamplesReader,
  PersonalMatchContext,
  SequenceExampleRequest,
} from '../../ports/sequence-examples-reader';
@Injectable()
export class SequenceExamplesAdapter implements SequenceExamplesReader {
  constructor(private readonly snapshot: ReadSnapshot) {}
  countUnpublished(
    f: PersonalMatchContext,
    publishedMatchIds: readonly string[],
  ) {
    return this.snapshot
      .client()
      .match.count({
        where: {
          matchId: { notIn: [...publishedMatchIds] },
          queueId: f.queueId,
          mapId: f.mapId,
          gameCreation: { gte: BigInt(f.fromMs), lt: BigInt(f.toMs) },
          ...(f.patch
            ? {
                OR: [
                  { gameVersion: f.patch },
                  { gameVersion: { startsWith: `${f.patch}.` } },
                ],
              }
            : {}),
          participants: {
            some: {
              puuid: f.playerId,
              championId: f.championId,
              role: f.role === 'MIDDLE' ? { in: ['MID', 'MIDDLE'] } : f.role,
            },
          },
        },
      });
  }
  async readExample(r: SequenceExampleRequest) {
    const tx = this.snapshot.client();
    const match = await tx.match.findUnique({
      where: { matchId: r.matchId },
      include: {
        participants: { select: { puuid: true, teamId: true } },
        teams: { select: { teamId: true, win: true } },
        timelineProjection: true,
      },
    });
    if (!match)
      return {
        matchId: r.matchId,
        reason: 'missing_match',
        episodes: [],
        totalEpisodes: 0,
        truncated: false,
      };
    const events = await tx.matchEventProjection.findMany({
      where: {
        matchId: r.matchId,
        type: {
          in: [
            'CHAMPION_KILL',
            'ELITE_MONSTER_KILL',
            'BUILDING_KILL',
            'GAME_END',
          ],
        },
      },
      orderBy: [{ frameIndex: 'asc' }, { eventIndex: 'asc' }],
      take: r.eventLimit + 1,
    });
    if (events.length > r.eventLimit)
      return {
        matchId: r.matchId,
        reason: 'example_event_limit',
        episodes: [],
        totalEpisodes: 0,
        truncated: true,
      };
    // Supported persisted events must agree with the publication generation; no job table read.
    const sequence = calculateSequences({
      ...match,
      events,
      projection: readSnapshotProjection(match.timelineProjection),
      processing: {
        status: 'COMPLETED',
        processingVersion: r.processingVersion,
        completedAt: new Date(r.processedAt),
      },
    });
    const episodes =
      sequence.report?.deathEpisodes.filter(
        (e) => e.subjectId === r.subjectId,
      ) ?? [];
    return {
      matchId: r.matchId,
      reason: sequence.reason,
      episodes: episodes.slice(0, r.episodeLimit),
      totalEpisodes: episodes.length,
      truncated: episodes.length > r.episodeLimit,
    };
  }
}
