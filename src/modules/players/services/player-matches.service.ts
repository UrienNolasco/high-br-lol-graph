import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  PlayerMatchesDto,
  PlayerMatchesQueryDto,
  PlayerMatchesPageQueryDto,
} from '../dto/player-match.dto';
import { MatchRepository } from '../repositories/match.repository';
import {
  buildMatchWhere,
  buildMatchOrderBy,
  toPlayerMatchDto,
  MatchRow,
} from '../pure/match.mapper';

@Injectable()
export class PlayerMatchesService {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlayerMatchesService.name);
  }

  async getMatches(
    puuid: string,
    filters: PlayerMatchesQueryDto,
  ): Promise<PlayerMatchesDto> {
    const limit = filters.limit ?? 20;

    let cursorGameCreation: bigint | undefined;
    if (filters.cursor) {
      const cursorMatch = await this.matchRepo.findByMatchId(filters.cursor);
      cursorGameCreation = cursorMatch?.gameCreation;
    }

    const where = buildMatchWhere(puuid, filters, cursorGameCreation);
    const orderBy = buildMatchOrderBy(filters.sortBy);
    const matches = await this.matchRepo.findCursorMatches(
      where,
      orderBy,
      limit,
    );

    const hasMore = matches.length > limit;
    const resultMatches = matches.slice(0, limit);
    const enriched = resultMatches.map((m) =>
      toPlayerMatchDto(m as unknown as MatchRow),
    );

    return {
      puuid,
      matches: enriched,
      nextCursor: hasMore ? enriched[enriched.length - 1].matchId : null,
      hasMore,
    };
  }

  async getMatchesByPage(
    puuid: string,
    filters: PlayerMatchesPageQueryDto,
  ): Promise<PlayerMatchesDto> {
    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;
    const skip = (page - 1) * limit;
    const where = buildMatchWhere(puuid, filters);
    const orderBy = buildMatchOrderBy(filters.sortBy);
    const matches = await this.matchRepo.findPagedMatches(
      where,
      orderBy,
      skip,
      limit,
    );

    const hasMore = matches.length > limit;
    const resultMatches = matches.slice(0, limit);
    const enriched = resultMatches.map((m) =>
      toPlayerMatchDto(m as unknown as MatchRow),
    );

    return {
      puuid,
      matches: enriched,
      nextCursor: hasMore ? enriched[enriched.length - 1].matchId : null,
      hasMore,
    };
  }
}
