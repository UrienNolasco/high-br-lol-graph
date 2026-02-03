import { Injectable, Logger } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QueueService } from '../../core/queue/queue.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserUpdateResponseDto } from './dto/user-update-response.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly riotService: RiotService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async updateUser(dto: UpdateUserDto): Promise<UserUpdateResponseDto> {
    this.logger.log(`Processing update request for ${dto.gameName}#${dto.tagLine}`);

    try {
      // 1. Resolver PUUID via Account-V1
      const account = await this.riotService.getAccountByRiotId(
        dto.gameName,
        dto.tagLine,
      );

      this.logger.log(`Found PUUID: ${account.puuid}`);

      // 2. Upsert User no banco (cache de PUUID)
      await this.prisma.user.upsert({
        where: { puuid: account.puuid },
        update: {
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          profileIconId: account.profileIconId,
          summonerLevel: account.summonerLevel,
          lastUpdated: new Date(),
        },
        create: {
          puuid: account.puuid,
          gameName: dto.gameName,
          tagLine: dto.tagLine,
          region: dto.region || 'br1',
          profileIconId: account.profileIconId,
          summonerLevel: account.summonerLevel,
        },
      });

      // 3. Buscar últimos 20 match IDs
      const matchIds = await this.riotService.getMatchIdsByPuuid(
        account.puuid,
        20,
      );

      this.logger.log(`Found ${matchIds.length} match IDs for PUUID`);

      // 4. Verificar quais já existem no banco
      const existingMatches = await this.prisma.match.findMany({
        where: { matchId: { in: matchIds } },
        select: { matchId: true },
      });

      const existingIds = new Set(existingMatches.map((m) => m.matchId));
      const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

      this.logger.log(
        `${newMatchIds.length} new matches found, ${existingIds.size} already exist`,
      );

      // 5. Se houver partidas novas, enfileirar
      if (newMatchIds.length > 0) {
        for (const matchId of newMatchIds) {
          this.queueService.publish('user.update', { matchId });
        }

        return {
          puuid: account.puuid,
          status: 'processing',
          newMatches: newMatchIds.length,
          message: `${newMatchIds.length} novas partidas enfileiradas.`,
        };
      }

      return {
        puuid: account.puuid,
        status: 'up_to_date',
        newMatches: 0,
        message: 'Nenhuma partida nova encontrada.',
      };
    } catch (error) {
      this.logger.error(
        `Error processing update for ${dto.gameName}#${dto.tagLine}:`,
        error,
      );
      throw error;
    }
  }
}
