import { Injectable } from '@nestjs/common';
import { InvalidMatchError } from '../../../../lib/processing-errors';
import type { MatchDto } from '../../../../core/riot/dto/match.dto';
import type { TimelineDto } from '../../../../core/riot/dto/timeline.dto';
import { buildParticipantMap, parseMatchData } from './match.parser';
import { TimelineParserService } from './timeline-parser.service';
import type { MatchPreparer, PreparedMatch } from '../../ports/match-preparer';

@Injectable()
export class RiotMatchPreparer implements MatchPreparer {
  constructor(private readonly timelineParser: TimelineParserService) {}

  prepare(
    matchId: string,
    summaryInput: unknown,
    timelineInput: unknown,
    processingVersion: number,
  ): PreparedMatch {
    const summary = summaryInput as MatchDto;
    const timeline = timelineInput as TimelineDto;
    const participantMap = this.validate(matchId, summary, timeline);
    return {
      matchData: parseMatchData(summary),
      timeline: this.timelineParser.parseTimeline(
        timeline,
        participantMap,
        new Map(
          summary.info.participants.map((p) => [p.participantId, p.teamId]),
        ),
        processingVersion,
      ),
    };
  }

  private validate(matchId: string, summary: MatchDto, timeline: TimelineDto) {
    const participants = summary?.info?.participants;
    const teams = summary?.info?.teams;
    const frames = timeline?.info?.frames;
    const nonnegative = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (
      summary?.metadata?.matchId !== matchId ||
      timeline?.metadata?.matchId !== matchId ||
      !Number.isSafeInteger(summary.info?.gameDuration) ||
      summary.info.gameDuration <= 0 ||
      !Number.isSafeInteger(summary.info?.gameCreation) ||
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
      participants.some(
        (p) =>
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
      )
    ) {
      throw new InvalidMatchError(
        'Invalid match/timeline identity, patch, teams, participants or frames',
      );
    }
    const participantMap = buildParticipantMap(
      timeline.metadata.participants,
      participants,
      timeline.info.participants,
    );
    if (
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
              !participantMap.has(pf.participantId) ||
              String(pf.participantId) !== id ||
              ![
                pf.totalGold,
                pf.xp,
                pf.minionsKilled,
                pf.jungleMinionsKilled,
                pf.damageStats?.totalDamageDoneToChampions,
              ].every((value) => value == null || nonnegative(value)),
          ),
      )
    ) {
      throw new InvalidMatchError(
        'Invalid match/timeline identity, patch, teams, participants or frames',
      );
    }
    return participantMap;
  }
}
