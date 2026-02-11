import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  MatchGoldTimelineDto,
  MatchTimelineEventsDto,
  MatchBuildsDto,
  MatchPerformanceComparisonDto,
} from './dto/match-deep-dive.dto';

@Injectable()
export class MatchDeepDiveService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gráfico de diferença de ouro entre times ao longo da partida.
   * Calcula gold por time em cada minuto, identifica vencedor,
   * ponto de maior vantagem e "throw point" (swing > 3k).
   */
  async getMatchGoldTimeline(
    matchId: string,
  ): Promise<MatchGoldTimelineDto> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: { teamId: true, goldGraph: true },
    });

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const maxMinutes = Math.max(
      ...participants.map((p) => p.goldGraph.length),
    );

    const goldDifference: {
      minute: number;
      blueTeam: number;
      redTeam: number;
      difference: number;
    }[] = [];
    for (let minute = 0; minute < maxMinutes; minute++) {
      const blueTeam = participants
        .filter((p) => p.teamId === 100)
        .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

      const redTeam = participants
        .filter((p) => p.teamId === 200)
        .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

      goldDifference.push({
        minute,
        blueTeam,
        redTeam,
        difference: blueTeam - redTeam,
      });
    }

    // Vencedor em ouro final
    const lastEntry = goldDifference[goldDifference.length - 1];
    const winner = lastEntry.difference > 0 ? 'blueTeam' : 'redTeam';

    // Ponto de maior vantagem (maior |difference|)
    const maxAdvantageEntry = goldDifference.reduce((max, entry) =>
      Math.abs(entry.difference) > Math.abs(max.difference) ? entry : max,
    );

    const maxAdvantage = {
      minute: maxAdvantageEntry.minute,
      team: maxAdvantageEntry.difference > 0 ? 'blueTeam' : 'redTeam',
      difference: Math.abs(maxAdvantageEntry.difference),
    };

    // Throw point: maior swing > 3k entre minutos consecutivos
    let throwPoint: MatchGoldTimelineDto['throwPoint'] = null;
    for (let i = 1; i < goldDifference.length; i++) {
      const swing = Math.abs(
        goldDifference[i].difference - goldDifference[i - 1].difference,
      );
      if (swing > 3000 && !throwPoint) {
        throwPoint = {
          minute: i,
          beforeDifference: goldDifference[i - 1].difference,
          afterDifference: goldDifference[i].difference,
          swing,
        };
      }
    }

    return {
      matchId,
      goldDifference,
      winner,
      maxAdvantage,
      throwPoint,
    };
  }

  /**
   * Heatmap de eventos importantes (kills, deaths, wards, objetivos).
   * Extrai posições de kill/death/ward de cada participante e
   * objectives timeline de cada time.
   */
  async getMatchTimelineEvents(
    matchId: string,
  ): Promise<MatchTimelineEventsDto> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: {
        puuid: true,
        championId: true,
        killPositions: true,
        deathPositions: true,
        wardPositions: true,
      },
    });

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const teams = await this.prisma.matchTeam.findMany({
      where: { matchId },
      select: { teamId: true, objectivesTimeline: true },
    });

    // Flatten kill positions
    const kills = participants.flatMap((p) =>
      (p.killPositions as any[]).map((pos) => ({
        puuid: p.puuid,
        championId: p.championId,
        x: pos.x,
        y: pos.y,
        timestamp: pos.timestamp,
        minute: Math.floor(pos.timestamp / 60000),
      })),
    );

    // Flatten death positions
    const deaths = participants.flatMap((p) =>
      (p.deathPositions as any[]).map((pos) => ({
        puuid: p.puuid,
        championId: p.championId,
        x: pos.x,
        y: pos.y,
        timestamp: pos.timestamp,
        minute: Math.floor(pos.timestamp / 60000),
      })),
    );

    // Flatten ward positions
    const wards = participants.flatMap((p) =>
      (p.wardPositions as any[]).map((pos) => ({
        puuid: p.puuid,
        wardType: pos.wardType,
        x: pos.x,
        y: pos.y,
        timestamp: pos.timestamp,
        minute: Math.floor(pos.timestamp / 60000),
      })),
    );

    // Flatten objectives de todos os times
    const objectives = teams.flatMap((team) =>
      (team.objectivesTimeline as any[]).map((obj) => ({
        type: obj.type,
        subType: obj.subType,
        teamId: obj.teamId ?? team.teamId,
        timestamp: obj.timestamp,
        minute: Math.floor(obj.timestamp / 60000),
        killerId: obj.killerId,
      })),
    );

    return {
      matchId,
      events: { kills, deaths, wards, objectives },
    };
  }

  /**
   * Evolução de builds de todos os participantes.
   * Processa itemTimeline e calcula build final (últimos 6 itens comprados únicos).
   */
  async getMatchBuilds(matchId: string): Promise<MatchBuildsDto> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: {
        puuid: true,
        championId: true,
        championName: true,
        itemTimeline: true,
      },
    });

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const builds = participants.map((p) => {
      const rawTimeline = p.itemTimeline as any[];

      const itemTimeline = rawTimeline.map((item) => ({
        itemId: item.itemId,
        timestamp: item.timestamp,
        minute: parseFloat((item.timestamp / 60000).toFixed(1)),
        type: item.type,
      }));

      // Build final: últimos BUY events únicos (últimos 6)
      const buyEvents = itemTimeline.filter((e) => e.type === 'BUY');
      const finalBuildIds = [...new Set(buyEvents.map((e) => e.itemId))].slice(
        -6,
      );
      const finalBuild = finalBuildIds.map((itemId) => ({ itemId }));

      return {
        puuid: p.puuid,
        championId: p.championId,
        championName: p.championName,
        itemTimeline,
        finalBuild,
      };
    });

    return { matchId, builds };
  }

  /**
   * Radar chart comparativo: jogador vs oponente de lane.
   * Calcula métricas per-minute e compara com o oponente de mesma role.
   */
  async getMatchPerformanceComparison(
    matchId: string,
    puuid: string,
  ): Promise<MatchPerformanceComparisonDto> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId },
      include: { match: { select: { gameDuration: true } } },
    });

    if (participants.length === 0) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    const player = participants.find((p) => p.puuid === puuid);
    if (!player) {
      throw new NotFoundException(
        `Player ${puuid} not found in match ${matchId}`,
      );
    }

    // Oponente: mesmo role, time oposto
    const opponent = participants.find(
      (p) => p.role === player.role && p.teamId !== player.teamId,
    );

    const gameDurationMinutes = player.match.gameDuration / 60;

    const lastCs =
      player.csGraph.length > 0
        ? player.csGraph[player.csGraph.length - 1]
        : 0;

    const playerMetrics = {
      championId: player.championId,
      championName: player.championName,
      role: player.role,
      dpm: parseFloat(
        (player.totalDamage / gameDurationMinutes).toFixed(1),
      ),
      gpm: parseFloat(
        (player.goldEarned / gameDurationMinutes).toFixed(1),
      ),
      cspm: parseFloat((lastCs / gameDurationMinutes).toFixed(1)),
      visionScorePerMin: parseFloat(
        (player.visionScore / gameDurationMinutes).toFixed(2),
      ),
      damageTakenPerMin: parseFloat(
        (player.damageTaken / gameDurationMinutes).toFixed(1),
      ),
      kda: player.kda,
    };

    let opponentMetrics: MatchPerformanceComparisonDto['opponent'] = null;
    let comparison: MatchPerformanceComparisonDto['comparison'] = null;

    if (opponent) {
      const oppLastCs =
        opponent.csGraph.length > 0
          ? opponent.csGraph[opponent.csGraph.length - 1]
          : 0;

      opponentMetrics = {
        puuid: opponent.puuid,
        championId: opponent.championId,
        championName: opponent.championName,
        role: opponent.role,
        dpm: parseFloat(
          (opponent.totalDamage / gameDurationMinutes).toFixed(1),
        ),
        gpm: parseFloat(
          (opponent.goldEarned / gameDurationMinutes).toFixed(1),
        ),
        cspm: parseFloat((oppLastCs / gameDurationMinutes).toFixed(1)),
        visionScorePerMin: parseFloat(
          (opponent.visionScore / gameDurationMinutes).toFixed(2),
        ),
        damageTakenPerMin: parseFloat(
          (opponent.damageTaken / gameDurationMinutes).toFixed(1),
        ),
        kda: opponent.kda,
      };

      const safeDivide = (a: number, b: number) =>
        b !== 0 ? parseFloat(((a / b) * 100).toFixed(1)) : 0;

      comparison = {
        dpmAdvantage: parseFloat(
          (playerMetrics.dpm - opponentMetrics.dpm).toFixed(1),
        ),
        dpmAdvantagePercent: safeDivide(
          playerMetrics.dpm - opponentMetrics.dpm,
          opponentMetrics.dpm,
        ),
        gpmAdvantage: parseFloat(
          (playerMetrics.gpm - opponentMetrics.gpm).toFixed(1),
        ),
        gpmAdvantagePercent: safeDivide(
          playerMetrics.gpm - opponentMetrics.gpm,
          opponentMetrics.gpm,
        ),
        cspmAdvantage: parseFloat(
          (playerMetrics.cspm - opponentMetrics.cspm).toFixed(1),
        ),
        cspmAdvantagePercent: safeDivide(
          playerMetrics.cspm - opponentMetrics.cspm,
          opponentMetrics.cspm,
        ),
        visionAdvantage: parseFloat(
          (
            playerMetrics.visionScorePerMin -
            opponentMetrics.visionScorePerMin
          ).toFixed(2),
        ),
        survivability: parseFloat(
          (
            opponentMetrics.damageTakenPerMin -
            playerMetrics.damageTakenPerMin
          ).toFixed(1),
        ),
      };
    }

    return {
      matchId,
      puuid,
      player: playerMetrics,
      opponent: opponentMetrics,
      comparison,
    };
  }
}
