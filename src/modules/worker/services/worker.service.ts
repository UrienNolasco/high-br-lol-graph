import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import { RiotService } from '../../../core/riot/riot.service';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { ProcessMatchDto } from '../dto/process-match.dto';
import { traceIdStore } from '../../../core/logger';
import { getErrorMessage } from '../../../core/logger/get-error-message';
import { MatchPersistenceService } from './match-persistence.service';
import { PlayerAggregatesUpdateService } from './player-aggregates-update.service';
import { buildParticipantMap, parseMatchData } from '../pure/match.parser';

@Injectable()
export class WorkerService {
  constructor(
    private readonly riotService: RiotService,
    private readonly timelineParser: TimelineParserService,
    private readonly persistence: MatchPersistenceService,
    private readonly playerAggregates: PlayerAggregatesUpdateService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerService.name);
  }

  async processMatch(payload: ProcessMatchDto): Promise<void> {
    const { matchId } = payload;
    const traceId = traceIdStore.getStore()?.traceId;
    const startTime = Date.now();

    try {
      this.logger.info(
        { matchId, traceId, event: 'match_processing_started' },
        `Processing match ${matchId}`,
      );

      if (await this.persistence.exists(matchId)) {
        this.logger.info(
          {
            matchId,
            traceId,
            event: 'match_skipped',
            reason: 'already_exists',
          },
          `Match ${matchId} já existe. Skipping.`,
        );
        return;
      }

      const [matchDto, timelineDto] = await Promise.all([
        this.riotService.getMatchById(matchId),
        this.riotService.getTimeline(matchId),
      ]);

      if (!timelineDto) {
        this.logger.warn(
          { matchId, traceId, event: 'match_skipped', reason: 'no_timeline' },
          `Match ${matchId} sem timeline disponível. Ignorando partida.`,
        );
        return;
      }

      const participantMap = buildParticipantMap(
        timelineDto.metadata.participants,
        matchDto.info.participants,
        (participantId, puuid) => {
          this.logger.warn(
            { participantId, puuid, event: 'puuid_mismatch' },
            `PUUID ${puuid} (ParticipantID ${participantId}) não encontrado no matchDto`,
          );
        },
      );

      const matchData = parseMatchData(matchDto);
      const timelineData = this.timelineParser.parseTimeline(
        timelineDto,
        participantMap,
      );

      await this.persistence.save(matchData, timelineData);
      await this.persistence.updateChampionStats(matchData);
      await this.playerAggregates.update(matchData, timelineData);

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          matchId,
          traceId,
          event: 'match_processing_completed',
          duration,
          queueId: matchDto.info.queueId,
          steps: ['extract', 'transform', 'load', 'aggregation'],
        },
        `Match ${matchId} processed with timeline (${matchDto.info.gameDuration}s).`,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          {
            matchId,
            traceId,
            event: 'match_skipped',
            reason: 'duplicate_p2002',
          },
          `Match ${matchId} foi processada por outro worker. Skipping.`,
        );
        return;
      }
      const duration = Date.now() - startTime;
      this.logger.error(
        {
          matchId,
          traceId,
          event: 'match_failed',
          duration,
          error: getErrorMessage(error),
          step: 'processing',
        },
        `Error processing match ${matchId}`,
      );
      throw error;
    }
  }
}
