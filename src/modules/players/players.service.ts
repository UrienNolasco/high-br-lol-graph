import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QueueService } from '../../core/queue/queue.service';
import { PlayerSearchDto } from './dto/player-search.dto';
import { PlayerResponseDto } from './dto/player-response.dto';

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly riotService: RiotService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async searchPlayer(dto: PlayerSearchDto): Promise<PlayerResponseDto> {
    this.logger.log(`Searching player: ${dto.gameName}#${dto.tagLine}`);

    const REGION = 'br1'; // Região fixa

    try {
      // Step 1: Resolver PUUID via Account-V1
      const account = await this.riotService.getAccountByRiotId(
        dto.gameName,
        dto.tagLine,
      );

      this.logger.log(`Found PUUID: ${account.puuid}`);

      // Step 2: Obter dados visuais via Summoner-V4
      const summoner = await this.riotService.getSummonerByPuuid(
        account.puuid,
        REGION,
      );

      this.logger.log(
        `Found summoner data: Icon=${summoner.profileIconId}, Level=${summoner.summonerLevel}`,
      );

      // Step 3: Buscar ranked stats (League-V4)
      const leagueEntries = await this.riotService.getRankedStatsBySummonerId(
        summoner.id,
        REGION,
      );
      const rankedSolo = leagueEntries.find(
        (e) => e.queueType === 'RANKED_SOLO_5x5',
      );

      this.logger.log(
        rankedSolo
          ? `Found ranked stats: ${rankedSolo.tier} ${rankedSolo.rank} ${rankedSolo.leaguePoints}LP`
          : 'No ranked solo/duo stats found',
      );

      // Step 4: Buscar últimos 20 match IDs
      const matchIds = await this.riotService.getMatchIdsByPuuid(
        account.puuid,
        20,
      );

      this.logger.log(`Found ${matchIds.length} match IDs for PUUID`);

      // Step 5: Diff check - verificar quais já existem no banco
      const existingMatches = await this.prisma.match.findMany({
        where: { matchId: { in: matchIds } },
        select: { matchId: true },
      });

      const existingIds = new Set(existingMatches.map((m) => m.matchId));
      const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

      this.logger.log(
        `${newMatchIds.length} new matches, ${existingIds.size} already exist`,
      );

      // Step 6: Enfileirar novas partidas com prioridade ALTA (10)
      for (const matchId of newMatchIds) {
        this.queueService.publishUserRequestedMatch(matchId);
      }

      // Step 7: Upsert User no banco com TODOS os dados
      await this.prisma.user.upsert({
        where: { puuid: account.puuid },
        update: {
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          summonerId: summoner.id,
          tier: rankedSolo?.tier || null,
          rank: rankedSolo?.rank || null,
          leaguePoints: rankedSolo?.leaguePoints || null,
          rankedWins: rankedSolo?.wins || null,
          rankedLosses: rankedSolo?.losses || null,
          lastUpdated: new Date(),
        },
        create: {
          puuid: account.puuid,
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          region: REGION,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          summonerId: summoner.id,
          tier: rankedSolo?.tier || null,
          rank: rankedSolo?.rank || null,
          leaguePoints: rankedSolo?.leaguePoints || null,
          rankedWins: rankedSolo?.wins || null,
          rankedLosses: rankedSolo?.losses || null,
        },
      });

      // Step 8: Retornar resposta enriquecida para o App
      return {
        puuid: account.puuid,
        gameName: dto.gameName,
        tagLine: dto.tagLine,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        matchesEnqueued: newMatchIds.length,
      };
    } catch (error) {
      this.logger.error(
        `Error searching player ${dto.gameName}#${dto.tagLine}:`,
        error,
      );

      // Se Account V1 ou Summoner V4 retornarem 404, propagar como NotFoundException
      if (error?.response?.status === 404) {
        throw new NotFoundException(
          `Player ${dto.gameName}#${dto.tagLine} not found`,
        );
      }

      throw error;
    }
  }
}
