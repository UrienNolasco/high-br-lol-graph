import { Injectable, Logger } from '@nestjs/common';
import { RiotService } from '../../core/riot/riot.service';
import { TimelineParserService } from '../../core/riot/timeline-parser.service';
import {
  PlayerStatsAggregationService,
  ParticipantData,
} from '../../core/stats/player-stats-aggregation.service';
import { ProcessMatchDto } from './dto/process-match.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MatchDto, ParticipantDto } from '../../core/riot/dto/match.dto';
import { TimelineDto } from '../../core/riot/dto/timeline.dto';
import { Prisma } from '@prisma/client';

/**
 * Dados processados do Match V5 para inserção no banco
 */
interface ProcessedMatchData {
  match: {
    matchId: string;
    gameCreation: bigint;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    gameVersion: string;
    mapId: number;
  };
  teams: Array<{
    matchId: string;
    teamId: number;
    win: boolean;
    bans: number[];
    objectivesTimeline: any;
  }>;
  participants: Array<{
    matchId: string;
    puuid: string;
    summonerName: string;
    championId: number;
    championName: string;
    teamId: number;
    role: string;
    lane: string;
    win: boolean;

    // Estatísticas finais
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    goldEarned: number;
    totalDamage: number;
    visionScore: number;

    // Dados brutos JSONB
    runes: any;
    challenges: any;
    pings: any;
    spells: number[];
  }>;
}

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotService: RiotService,
    private readonly timelineParser: TimelineParserService,
    private readonly playerStatsAggregation: PlayerStatsAggregationService,
  ) {}

  /**
   * Processa uma partida completa (Match + Timeline ETL)
   *
   * Fluxo:
   * 1. Verifica idempotência
   * 2. Busca Match + Timeline em paralelo
   * 3. Se não tiver timeline, ignora a partida
   * 4. Processa dados e salva transacionalmente
   */
  async processMatch(payload: ProcessMatchDto): Promise<void> {
    const { matchId } = payload;

    try {
      // 1. Idempotência - verificar se já existe
      const existing = await this.prisma.match.findUnique({
        where: { matchId },
      });

      if (existing) {
        this.logger.warn(`Match ${matchId} já existe. Skipping.`);
        return;
      }

      // 2. Extract - Buscar Match + Timeline em PARALELO
      const [matchDto, timelineDto] = await Promise.all([
        this.riotService.getMatchById(matchId),
        this.riotService.getTimeline(matchId),
      ]);

      // 3. Se não tem timeline, ignorar partida (conforme decisão do usuário)
      if (!timelineDto) {
        this.logger.warn(
          `Match ${matchId} sem timeline disponível. Ignorando partida.`,
        );
        return;
      }

      // 4. Transform - Processar dados

      // 4a. Criar mapa de tradução ParticipantID → PUUID
      const participantMap = this.buildParticipantMap(
        timelineDto.metadata.participants,
        matchDto.info.participants,
      );

      // 4b. Processar Match V5
      const matchData = this.parseMatchData(matchDto);

      // 4c. Processar Timeline V5
      const timelineData = this.timelineParser.parseTimeline(
        timelineDto,
        participantMap,
      );

      // 5. Load - Salvar transacionalmente
      await this.saveMatchData(matchData, timelineData);

      // 6. Atualizar agregações de jogadores (PlayerStats + PlayerChampionStats)
      await this.updatePlayerAggregates(matchData, timelineData);

      this.logger.log(
        `✅ Match ${matchId} processada com timeline (${matchDto.info.gameDuration}s).`,
      );
    } catch (error) {
      if (error.code === 'P2002') {
        this.logger.warn(
          `Match ${matchId} foi processada por outro worker. Skipping.`,
        );
        return;
      }
      this.logger.error(`Erro ao processar match ${matchId}:`, error.stack);
      throw error;
    }
  }

  /**
   * Cria mapa de tradução ParticipantID (1-10) → PUUID
   *
   * A Timeline usa ParticipantID numérico (1-10), mas nosso banco usa PUUID.
   * O metadata da timeline tem um array de PUUIDs onde índice + 1 = ParticipantID.
   */
  private buildParticipantMap(
    timelinePuuids: string[],
    matchParticipants: ParticipantDto[],
  ): Map<number, string> {
    const map = new Map<number, string>();

    // Timeline tem array de PUUIDs na ordem (índice + 1 = ParticipantID)
    timelinePuuids.forEach((puuid, index) => {
      map.set(index + 1, puuid); // ParticipantID começa em 1
    });

    // Validar cruzando com matchDto (confirmação adicional)
    const participantPuuids = new Set(matchParticipants.map((p) => p.puuid));
    for (const [participantId, puuid] of map.entries()) {
      if (!participantPuuids.has(puuid)) {
        this.logger.warn(
          `PUUID ${puuid} (ParticipantID ${participantId}) não encontrado no matchDto`,
        );
      }
    }

    return map;
  }

  /**
   * Processa dados do Match V5 para formato do banco
   */
  private parseMatchData(matchDto: MatchDto): ProcessedMatchData {
    const { info, metadata } = matchDto;

    // Dados da Match
    const match = {
      matchId: metadata.matchId,
      gameCreation: BigInt(info.gameCreation),
      gameDuration: info.gameDuration,
      gameMode: info.gameMode,
      queueId: info.queueId,
      gameVersion: info.gameVersion,
      mapId: info.mapId,
    };

    // Dados dos Times
    const teams =
      info.teams?.map((team) => ({
        matchId: metadata.matchId,
        teamId: team.teamId,
        win: team.win,
        bans: team.bans?.map((b) => b.championId).filter((id) => id > 0) || [],
        objectivesTimeline: team.objectives,
      })) || [];

    // Dados dos Participantes
    const participants = info.participants.map(
      (p): ProcessedMatchData['participants'][0] => {
        // Extrair pings (todas as propriedades que terminam em 'Pings')
        const pings: Record<string, number> = {};
        for (const [key, value] of Object.entries(p)) {
          if (key.endsWith('Pings') && typeof value === 'number') {
            pings[key] = value;
          }
        }

        // Calcular KDA
        const deaths: number = p.deaths || 1;
        const kda = (p.kills + p.assists) / deaths;

        return {
          matchId: metadata.matchId,
          puuid: p.puuid,
          summonerName: p.summonerName,
          championId: p.championId,
          championName: p.championName,
          teamId: p.teamId,
          role: p.role || '',
          lane: p.lane || p.individualPosition || '',
          win: p.win,

          // Estatísticas finais
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          kda,
          goldEarned: p.goldEarned,
          totalDamage: p.totalDamageDealtToChampions,
          visionScore: p.visionScore || 0,

          // Dados brutos JSONB
          runes: p.perks,
          challenges: p.challenges,
          pings,
          spells: [p.summoner1Id, p.summoner2Id],
        };
      },
    );

    return { match, teams, participants };
  }

  /**
   * Salva todos os dados transacionalmente
   * Otimização: Usa createMany para participantes (bulk insert)
   */
  private async saveMatchData(
    matchData: ProcessedMatchData,
    timelineData: ReturnType<TimelineParserService['parseTimeline']>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Criar Match
      await tx.match.create({
        data: matchData.match,
      });

      // 2. Criar Times (bulk insert)
      if (matchData.teams.length > 0) {
        await tx.matchTeam.createMany({
          data: matchData.teams,
        });
      }

      // 3. Criar Participantes (bulk insert - 1 INSERT com 10 linhas)
      const participantsData = matchData.participants.map((participant) => {
        const timelineParticipant = timelineData.participants.get(
          participant.puuid,
        );

        return {
          ...participant,
          // Dados da Timeline (convertidos para Prisma.InputJsonValue via unknown)
          goldGraph: timelineParticipant?.goldGraph || [],
          xpGraph: timelineParticipant?.xpGraph || [],
          csGraph: timelineParticipant?.csGraph || [],
          damageGraph: timelineParticipant?.damageGraph || [],
          deathPositions: (timelineParticipant?.deathPositions ||
            []) as unknown as Prisma.InputJsonValue,
          killPositions: (timelineParticipant?.killPositions ||
            []) as unknown as Prisma.InputJsonValue,
          wardPositions: (timelineParticipant?.wardPositions ||
            []) as unknown as Prisma.InputJsonValue,
          pathingSample: (timelineParticipant?.pathingSample ||
            []) as unknown as Prisma.InputJsonValue,
          skillOrder: timelineParticipant?.skillOrder || [],
          itemTimeline: (timelineParticipant?.itemTimeline ||
            []) as unknown as Prisma.InputJsonValue,
        };
      });

      await tx.matchParticipant.createMany({
        data: participantsData,
      });
    });

    // 4. Atualizar estatísticas agregadas de campeões (fora da transação)
    await this.updateChampionStats(matchData);
  }

  /**
   * Extrai o patch da versão do jogo
   * Ex: "15.23.1" -> "15.23"
   */
  private extractPatch(gameVersion: string): string {
    const parts = gameVersion.split('.');
    return `${parts[0]}.${parts[1]}`;
  }

  /**
   * Atualiza as estatísticas agregadas de campeões (ChampionStats)
   * Usa upsert para criar ou atualizar registros existentes.
   */
  private async updateChampionStats(
    matchData: ProcessedMatchData,
  ): Promise<void> {
    const patch = this.extractPatch(matchData.match.gameVersion);
    const queueId = matchData.match.queueId;
    const gameDurationInMinutes = matchData.match.gameDuration / 60;

    for (const participant of matchData.participants) {
      try {
        // Buscar estatísticas atuais para calcular médias ponderadas
        const current = await this.prisma.championStats.findUnique({
          where: {
            championId_patch_queueId: {
              championId: participant.championId,
              patch,
              queueId,
            },
          },
        });

        const gamesPlayed = (current?.gamesPlayed || 0) + 1;
        const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
        const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
        const winRate = (wins / gamesPlayed) * 100;

        // Médias ponderadas pelo número de jogos
        const newKda =
          (current?.kda || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          participant.kda * (1 / gamesPlayed);

        const newDpm =
          (current?.dpm || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          (participant.totalDamage / gameDurationInMinutes) * (1 / gamesPlayed);

        const newGpm =
          (current?.gpm || 0) * ((current?.gamesPlayed || 0) / gamesPlayed) +
          (participant.goldEarned / gameDurationInMinutes) * (1 / gamesPlayed);

        // CS não está disponível diretamente no participant, calcular 0 por enquanto
        const newCspm = current?.cspm || 0;

        await this.prisma.championStats.upsert({
          where: {
            championId_patch_queueId: {
              championId: participant.championId,
              patch,
              queueId,
            },
          },
          create: {
            championId: participant.championId,
            championName: participant.championName,
            patch,
            queueId,
            gamesPlayed: 1,
            wins: participant.win ? 1 : 0,
            losses: participant.win ? 0 : 1,
            winRate: participant.win ? 100 : 0,
            kda: participant.kda,
            dpm: participant.totalDamage / gameDurationInMinutes,
            cspm: 0,
            gpm: participant.goldEarned / gameDurationInMinutes,
            banRate: 0,
            pickRate: 0,
            tier: 'C',
            rank: 0,
          },
          update: {
            gamesPlayed,
            wins,
            losses,
            winRate,
            kda: newKda,
            dpm: newDpm,
            cspm: newCspm,
            gpm: newGpm,
          },
        });
      } catch (error) {
        this.logger.warn(
          `⚠️ [WORKER] - Erro ao atualizar ChampionStats para ${participant.championName}:`,
          (error as Error).message,
        );
      }
    }
  }

  private async updatePlayerAggregates(
    matchData: ProcessedMatchData,
    timelineData: ReturnType<TimelineParserService['parseTimeline']>,
  ): Promise<void> {
    const patch = this.extractPatch(matchData.match.gameVersion);
    const gameDurationMinutes = matchData.match.gameDuration / 60;

    for (const participant of matchData.participants) {
      try {
        const timelineParticipant = timelineData.participants.get(
          participant.puuid,
        );

        const participantData: ParticipantData = {
          ...participant,
          goldGraph: timelineParticipant?.goldGraph || [],
          xpGraph: timelineParticipant?.xpGraph || [],
          csGraph: timelineParticipant?.csGraph || [],
          damageGraph: timelineParticipant?.damageGraph || [],
        };

        const allParticipants: ParticipantData[] =
          matchData.participants.map((p) => {
            const tp = timelineData.participants.get(p.puuid);
            return {
              ...p,
              goldGraph: tp?.goldGraph || [],
              xpGraph: tp?.xpGraph || [],
              csGraph: tp?.csGraph || [],
              damageGraph: tp?.damageGraph || [],
            };
          });

        const opponent =
          this.playerStatsAggregation.findLaneOpponent(
            allParticipants,
            participantData,
          );

        await this.playerStatsAggregation.updatePlayerAggregates(
          participantData,
          opponent,
          patch,
          gameDurationMinutes,
        );
      } catch (error) {
        this.logger.warn(
          `⚠️ [WORKER] - Erro ao atualizar PlayerStats para ${participant.puuid}:`,
          (error as Error).message,
        );
      }
    }
  }
}
