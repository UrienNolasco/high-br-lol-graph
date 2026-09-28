import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MATCH_PARTICIPANT_READER } from '../matches/contracts/participant-reader';
import type { MatchParticipantReader } from '../matches/contracts/participant-reader';
import { IndicatorQueryDto, parseIndicatorQuery } from './indicator-query.dto';
import { calculateIndicators } from './pure/indicator-calculator';
import { summarizeIndicatorHistory } from './pure/indicator-history';
import { encodeIndicatorCursor } from './pure/indicator-cursor';
import { INDICATOR_FAMILIES, IndicatorFamily } from './pure/indicator-catalog';
@Injectable()
export class IndicatorService {
  constructor(
    @Inject(MATCH_PARTICIPANT_READER)
    private readonly repository: MatchParticipantReader,
  ) {}
  async match(matchId: string, puuid: string, query: IndicatorQueryDto) {
    if (
      Object.entries(query).some(
        ([k, value]) => value !== undefined && k !== 'family',
      )
    )
      throw new BadRequestException('Match indicators accept only family');
    if (
      query.family !== undefined &&
      !INDICATOR_FAMILIES.includes(query.family as IndicatorFamily)
    )
      throw new BadRequestException('Unknown indicator family');
    const input = await this.repository.read(matchId, puuid);
    if (!input) throw new NotFoundException('Match or participant not found');
    return calculateIndicators(
      input,
      query.family as IndicatorFamily | undefined,
    );
  }
  async history(puuid: string, query: IndicatorQueryDto) {
    const parsed = parseIndicatorQuery(query, puuid),
      selected = await this.repository.readHistory(
        parsed.filters,
        parsed.options.limit,
        parsed.after,
      ),
      report = summarizeIndicatorHistory(selected.inputs, parsed.options);
    const params = new URLSearchParams(
      Object.entries({
        ...parsed.filters,
        ...parsed.options,
        after: parsed.afterToken,
        playerId: undefined,
        groupOffset: parsed.options.groupOffset + parsed.options.groupLimit,
      }).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    );
    const last = selected.inputs.at(-1),
      nextAfter =
        selected.hasMore && last
          ? encodeIndicatorCursor(
              {
                gameCreation: last.match.gameCreation,
                matchId: last.match.matchId,
              },
              parsed.filters,
            )
          : null;
    const nextParams = new URLSearchParams(params);
    nextParams.set('groupOffset', '0');
    if (nextAfter) nextParams.set('after', nextAfter);
    return {
      ...report,
      playerId: puuid,
      filters: parsed.filters,
      selection: {
        totalMatchingMatchPlayers: selected.total,
        selectedMatchPlayers: selected.inputs.length,
        limit: parsed.options.limit,
        truncated: selected.truncated,
        hasMore: selected.hasMore,
        nextAfter,
        next: nextAfter
          ? `/api/v1/players/${encodeURIComponent(puuid)}/indicators?${nextParams}`
          : null,
        order: 'gameCreation DESC, matchId ASC',
        meaning:
          'All N and groups summarize only this cursor page; totalMatchingMatchPlayers is the count of the full filtered history',
      },
      groups: {
        ...report.groups,
        next: report.groups.hasMore
          ? `/api/v1/players/${encodeURIComponent(puuid)}/indicators?${params}`
          : null,
      },
    };
  }
}
