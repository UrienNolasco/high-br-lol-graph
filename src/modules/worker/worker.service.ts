import { Injectable, Logger } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { ProcessMatchDto } from './dto/process-match.dto';
import {
  MatchParserService,
  MatchupData,
  MatchParticipant,
} from '../../core/riot/match-parser.service';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotService: RiotService,
    private readonly matchParserService: MatchParserService,
  ) {}

  async processMatch(payload: ProcessMatchDto): Promise<void> {
    const { matchId } = payload;

    try {
      // Usar upsert para evitar condição de corrida
      const processedMatch = await this.prisma.processedMatch.upsert({
        where: { matchId },
        create: { matchId, patch: 'processing' }, // placeholder temporário
        update: {}, // não atualizar se já existe
      });

      // Se já foi processada (não é o placeholder), pular
      if (processedMatch.patch !== 'processing') {
        this.logger.warn(
          `Match ${matchId} has already been processed. Skipping.`,
        );
        return;
      }

      const matchDto = await this.riotService.getMatchById(matchId);
      const { patch, participants, matchups } =
        this.matchParserService.parseMatchData(matchDto);

      for (const participant of participants) {
        await this.upsertChampionStats(patch, participant);
      }

      for (const matchup of matchups) {
        await this.upsertMatchupStats(patch, matchup);
      }

      // Atualizar com o patch real
      await this.prisma.processedMatch.update({
        where: { matchId },
        data: { patch },
      });

      this.logger.log(
        `✅ [WORKER] - Partida ${matchId} processada e salva no banco de dados.`,
      );
    } catch (error) {
      // Se for erro de duplicação, apenas logar e continuar
      if (error.code === 'P2002') {
        this.logger.warn(
          `Match ${matchId} was processed by another worker. Skipping.`,
        );
        return;
      }
      throw error;
    }
  }

  private async upsertChampionStats(
    patch: string,
    participant: MatchParticipant,
  ): Promise<void> {
    const { championId, win } = participant;

    await this.prisma.championStats.upsert({
      where: { patch_championId: { patch, championId } },
      create: {
        patch,
        championId,
        gamesPlayed: 1,
        wins: win ? 1 : 0,
      },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: win ? 1 : 0 },
      },
    });
  }

  private async upsertMatchupStats(
    patch: string,
    matchup: MatchupData,
  ): Promise<void> {
    const { position, champion1, champion2, winner } = matchup;
    const championId1 = Math.min(champion1.id, champion2.id);
    const championId2 = Math.max(champion1.id, champion2.id);
    const champion1Won = winner.id === championId1;

    await this.prisma.matchupStats.upsert({
      where: {
        patch_championId1_championId2_role: {
          patch,
          championId1,
          championId2,
          role: position,
        },
      },
      create: {
        patch,
        championId1,
        championId2,
        role: position,
        gamesPlayed: 1,
        champion1Wins: champion1Won ? 1 : 0,
      },
      update: {
        gamesPlayed: { increment: 1 },
        champion1Wins: { increment: champion1Won ? 1 : 0 },
      },
    });
  }
}
