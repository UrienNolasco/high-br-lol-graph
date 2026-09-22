import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RiotService } from '../../../core/riot/riot.service';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
import { ProcessMatchDto } from '../dto/process-match.dto';
import { MatchPersistenceService } from './match-persistence.service';
import { buildParticipantMap, parseMatchData } from '../pure/match.parser';
import { ProcessingService } from '../../../core/processing/processing.service';
import {
  InvalidMatchError,
  MissingTimelineError,
} from '../../../core/processing/processing.constants';
import { MatchDto } from '../../../core/riot/dto/match.dto';
import { TimelineDto } from '../../../core/riot/dto/timeline.dto';
@Injectable()
export class WorkerService {
  constructor(
    private readonly riotService: RiotService,
    private readonly timelineParser: TimelineParserService,
    private readonly persistence: MatchPersistenceService,
    private readonly processing: ProcessingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerService.name);
  }
  async processMatch(payload: ProcessMatchDto, offline = false): Promise<void> {
    const { matchId } = payload;
    if (!offline) await this.processing.enqueue(matchId, 1, payload.traceId);
    const lease = await this.processing.claim(matchId, offline);
    if (!lease) return;
    const start = Date.now();
    let renewal = Promise.resolve();
    const heartbeat = setInterval(() => {
      renewal = renewal
        .then(() => this.processing.renew(lease))
        .catch((error) => {
          this.logger.warn({
            matchId,
            event: 'lease_renewal_failed',
            error: String(error),
          });
        });
    }, 20_000);
    heartbeat.unref();
    try {
      let summary = await this.processing.readRaw<MatchDto>(matchId, 'summary');
      if (!summary) {
        if (offline) throw new InvalidMatchError('Raw summary is missing');
        summary = await this.riotService.getMatchById(matchId);
        await this.processing.saveRaw(lease, 'summary', summary);
      }
      let timeline = await this.processing.readRaw<TimelineDto>(
        matchId,
        'timeline',
      );
      if (!timeline) {
        if (offline) throw new MissingTimelineError('Raw timeline is missing');
        timeline = await this.riotService.getTimeline(matchId);
        if (!timeline)
          throw new MissingTimelineError(
            'Timeline unavailable; summary retained',
          );
        await this.processing.saveRaw(lease, 'timeline', timeline);
      }
      this.validate(matchId, summary, timeline);
      const participantMap = buildParticipantMap(
        timeline.metadata.participants,
        summary.info.participants,
      );
      await this.persistence.save(
        lease,
        parseMatchData(summary),
        this.timelineParser.parseTimeline(timeline, participantMap),
        timeline,
        offline,
      );
      this.logger.info({
        matchId,
        event: 'match_processing_completed',
        duration: Date.now() - start,
        attempts: lease.attempts,
      });
    } catch (error) {
      // If recording recovery fails, throw so the original delivery is requeued.
      await this.processing.recordFailure(lease, error);
      this.logger.error({
        matchId,
        event: 'match_processing_failed',
        duration: Date.now() - start,
        error: String(error),
        attempts: lease.attempts,
      });
      if (offline) throw error;
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
  }
  private validate(matchId: string, summary: MatchDto, timeline: TimelineDto) {
    const participants = summary?.info?.participants;
    const teams = summary?.info?.teams;
    const timelinePuuids = timeline?.metadata?.participants;
    const frames = timeline?.info?.frames;
    const nonnegative = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (
      summary?.metadata?.matchId !== matchId ||
      timeline?.metadata?.matchId !== matchId ||
      !Number.isSafeInteger(summary.info?.gameDuration) ||
      summary.info.gameDuration <= 0 ||
      !Number.isSafeInteger(summary.info.gameCreation) ||
      summary.info.gameCreation < 0 ||
      !Number.isInteger(summary.info.queueId) ||
      !/^\d+\.\d+(?:\.\d+)*$/.test(summary.info.gameVersion) ||
      !Array.isArray(participants) ||
      !participants.length ||
      participants.some((p) => !p || typeof p.puuid !== 'string' || !p.puuid) ||
      !Array.isArray(teams) ||
      !teams.length ||
      teams.some(
        (team) =>
          !team ||
          !Number.isInteger(team.teamId) ||
          typeof team.win !== 'boolean',
      ) ||
      new Set(teams.map((team) => team.teamId)).size !== teams.length ||
      !Array.isArray(frames) ||
      !frames.length ||
      !Array.isArray(timelinePuuids) ||
      new Set(participants.map((p) => p.puuid)).size !== participants.length ||
      timelinePuuids.length !== participants.length ||
      new Set(timelinePuuids).size !== participants.length ||
      participants.some(
        (p) =>
          !Number.isInteger(p.participantId) ||
          timelinePuuids[p.participantId - 1] !== p.puuid ||
          !teams.some(
            (team) => team.teamId === p.teamId && team.win === p.win,
          ) ||
          !Number.isInteger(p.championId) ||
          p.championId <= 0 ||
          ![
            p.kills,
            p.deaths,
            p.assists,
            p.goldEarned,
            p.totalDamageDealtToChampions,
            p.totalDamageTaken,
            p.totalMinionsKilled,
            p.neutralMinionsKilled,
          ].every(nonnegative),
      ) ||
      frames.some(
        (frame, index) =>
          !frame ||
          !nonnegative(frame.timestamp) ||
          (index > 0 && frame.timestamp < frames[index - 1].timestamp) ||
          !frame.participantFrames ||
          typeof frame.participantFrames !== 'object' ||
          Array.isArray(frame.participantFrames) ||
          !Array.isArray(frame.events) ||
          frame.events.some(
            (event) =>
              !event ||
              typeof event.type !== 'string' ||
              !nonnegative(event.timestamp),
          ) ||
          Object.entries(frame.participantFrames).some(
            ([id, pf]) =>
              !pf ||
              !timelinePuuids[Number(id) - 1] ||
              pf.participantId !== Number(id) ||
              ![
                pf.totalGold,
                pf.xp,
                pf.minionsKilled,
                pf.jungleMinionsKilled,
                pf.damageStats?.totalDamageDoneToChampions,
              ].every(nonnegative),
          ),
      )
    ) {
      throw new InvalidMatchError(
        'Invalid match/timeline identity, patch, teams, participants or frames',
      );
    }
  }
}
