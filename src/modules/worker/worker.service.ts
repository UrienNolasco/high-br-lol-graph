import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiotService } from '../../core/riot/riot.service';
import { ChampionStats } from '../../core/database/entities/champion-stats.entity';
import { MatchupStats } from '../../core/database/entities/matchup-stats.entity';
import { ProcessedMatch } from '../../core/database/entities/processed-match.entity';
import { ProcessMatchDto } from './dto/process-match.dto';
import {
  MatchParserService,
  MatchupData,
  MatchParticipant,
} from '../../core/riot/match-parser.service';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    @InjectRepository(ProcessedMatch)
    private readonly processedMatchRepository: Repository<ProcessedMatch>,
    @InjectRepository(ChampionStats)
    private readonly championStatsRepository: Repository<ChampionStats>,
    @InjectRepository(MatchupStats)
    private readonly matchupStatsRepository: Repository<MatchupStats>,
    private readonly riotService: RiotService,
    private readonly matchParserService: MatchParserService,
  ) {}

  async processMatch(payload: ProcessMatchDto): Promise<void> {
    const { matchId } = payload;

    const isProcessed = await this.processedMatchRepository.findOneBy({
      matchId,
    });
    if (isProcessed) {
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

    const processedMatch = this.processedMatchRepository.create({
      matchId,
      patch,
    });
    await this.processedMatchRepository.save(processedMatch);

    this.logger.log(`Successfully processed match ${matchId}`);
  }

  private async upsertChampionStats(
    patch: string,
    participant: MatchParticipant,
  ): Promise<void> {
    const { championId, win } = participant;
    const criteria = { patch, championId };

    const updateResult = await this.championStatsRepository.update(criteria, {
      gamesPlayed: () => 'gamesPlayed + 1',
      wins: () => (win ? 'wins + 1' : 'wins'),
    });

    if (updateResult.affected === 0) {
      try {
        await this.championStatsRepository.insert({
          ...criteria,
          gamesPlayed: 1,
          wins: win ? 1 : 0,
        });
      } catch (error) {
        if (error.code !== '23505') throw error; // Ignora erro de violação de chave única
        // Se o erro ocorreu, outra requisição inseriu o dado. Tentamos o update novamente.
        await this.championStatsRepository.update(criteria, {
          gamesPlayed: () => 'gamesPlayed + 1',
          wins: () => (win ? 'wins + 1' : 'wins'),
        });
      }
    }
  }

  private async upsertMatchupStats(
    patch: string,
    matchup: MatchupData,
  ): Promise<void> {
    const { position, champion1, champion2, winner } = matchup;
    const championId1 = Math.min(champion1.id, champion2.id);
    const championId2 = Math.max(champion1.id, champion2.id);
    const champion1Won = winner.id === championId1;

    const criteria = { patch, championId1, championId2, role: position };

    const updateResult = await this.matchupStatsRepository.update(criteria, {
      gamesPlayed: () => 'gamesPlayed + 1',
      champion1Wins: () =>
        champion1Won ? 'champion1Wins + 1' : 'champion1Wins',
    });

    if (updateResult.affected === 0) {
      try {
        await this.matchupStatsRepository.insert({
          ...criteria,
          gamesPlayed: 1,
          champion1Wins: champion1Won ? 1 : 0,
        });
      } catch (error) {
        if (error.code !== '23505') throw error; // Ignora erro de violação de chave única
        await this.matchupStatsRepository.update(criteria, {
          gamesPlayed: () => 'gamesPlayed + 1',
          champion1Wins: () =>
            champion1Won ? 'champion1Wins + 1' : 'champion1Wins',
        });
      }
    }
  }
}
