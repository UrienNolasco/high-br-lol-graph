import { Injectable, Logger } from '@nestjs/common';
import {
  TimelineDto,
  TimelineFrame,
  TimelineEvent,
  ChampionKillEvent,
  WardPlacedEvent,
  WardKillEvent,
  ItemPurchasedEvent,
  ItemSoldEvent,
  ItemUndoEvent,
  SkillLevelUpEvent,
  EliteMonsterKillEvent,
  BuildingKillEvent,
  Position,
  skillSlotToLetter,
} from './dto/timeline.dto';

// ============================================================================
// INTERFACES DE RETORNO (dados processados)
// ============================================================================

export interface PositionEvent {
  x: number;
  y: number;
  timestamp: number;
}

export interface WardEvent extends PositionEvent {
  wardType: string;
}

export interface ItemEvent {
  itemId: number;
  timestamp: number;
  type: 'BUY' | 'SELL' | 'UNDO';
}

export interface PathPoint {
  x?: number;
  y?: number;
  time: number;
}

export interface ParticipantTimelineData {
  // Séries temporais - índice = minuto da partida
  goldGraph: number[];
  xpGraph: number[];
  csGraph: number[];
  damageGraph: number[];

  // Eventos espaciais
  deathPositions: PositionEvent[];
  killPositions: PositionEvent[];
  wardPositions: WardEvent[];
  pathingSample: PathPoint[];

  // Comportamento detalhado
  skillOrder: string[];
  itemTimeline: ItemEvent[];
}

export interface ParsedTimelineData {
  participants: Map<string, ParticipantTimelineData>; // Indexado por PUUID
  objectivesTimeline: ObjectiveEvent[];
}

export interface ObjectiveEvent {
  type: 'DRAGON' | 'BARON_NASHOR' | 'RIFTHERALD' | 'HORDE' | 'TOWER' | 'INHIBITOR';
  subType?: string;
  teamId: number;
  timestamp: number;
  killerId?: number;
}

// ============================================================================
// TIMELINE PARSER SERVICE
// ============================================================================

@Injectable()
export class TimelineParserService {
  private readonly logger = new Logger(TimelineParserService.name);

  /**
   * Processa a Timeline V5 e extrai dados estruturados para análise.
   *
   * @param timelineDto - Timeline completa da Riot API
   * @param participantMap - Map<number, string> onde chave = ParticipantID (1-10), valor = PUUID
   * @returns Dados processados indexados por PUUID
   */
  parseTimeline(
    timelineDto: TimelineDto,
    participantMap: Map<number, string>,
  ): ParsedTimelineData {
    const frames = timelineDto.info.frames;
    const totalMinutes = Math.ceil(frames[frames.length - 1]?.timestamp / 60000 || 40);

    // Inicializar estrutura de dados para cada participante (indexado por PUUID)
    const participantData = this.initializeParticipantData(
      Array.from(participantMap.values()),
      totalMinutes,
    );

    const objectivesTimeline: ObjectiveEvent[] = [];

    // Processar cada frame
    for (const frame of frames) {
      const minute = Math.floor(frame.timestamp / 60000);

      // 1. Extrair séries temporais (gold, xp, cs, damage)
      this.extractTimeSeries(frame, participantData, participantMap, minute);

      // 2. Extrair eventos (kills, wards, items, skills, objectives)
      this.extractEvents(frame, participantData, participantMap, objectivesTimeline);
    }

    return {
      participants: participantData,
      objectivesTimeline,
    };
  }

  /**
   * Inicializa estrutura de dados para cada PUUID
   */
  private initializeParticipantData(
    puuids: string[],
    totalMinutes: number,
  ): Map<string, ParticipantTimelineData> {
    const map = new Map<string, ParticipantTimelineData>();

    for (const puuid of puuids) {
      map.set(puuid, {
        goldGraph: new Array(totalMinutes).fill(0),
        xpGraph: new Array(totalMinutes).fill(0),
        csGraph: new Array(totalMinutes).fill(0),
        damageGraph: new Array(totalMinutes).fill(0),
        deathPositions: [],
        killPositions: [],
        wardPositions: [],
        pathingSample: [],
        skillOrder: [],
        itemTimeline: [],
      });
    }

    return map;
  }

  /**
   * Extrai séries temporais do frame (gold, xp, cs, damage)
   */
  private extractTimeSeries(
    frame: TimelineFrame,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
    minute: number,
  ): void {
    const participantFrames = frame.participantFrames;

    for (const [idStr, pf] of Object.entries(participantFrames)) {
      const participantId = parseInt(idStr, 10);
      const puuid = participantMap.get(participantId);

      if (!puuid) {
        this.logger.warn(`No PUUID found for ParticipantID: ${participantId}`);
        continue;
      }

      const participant = data.get(puuid);
      if (!participant) continue;

      // Preencher arrays de séries temporais
      participant.goldGraph[minute] = pf.totalGold;
      participant.xpGraph[minute] = pf.xp;
      participant.csGraph[minute] = pf.minionsKilled + pf.jungleMinionsKilled;
      participant.damageGraph[minute] = pf.damageStats.totalDamageDoneToChampions;

      // Amostragem de posição (pathing)
      participant.pathingSample.push({
        x: pf.position?.x,
        y: pf.position?.y,
        time: frame.timestamp,
      });
    }
  }

  /**
   * Extrai eventos do frame (kills, deaths, wards, items, skills, objectives)
   */
  private extractEvents(
    frame: TimelineFrame,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
    objectivesTimeline: ObjectiveEvent[],
  ): void {
    for (const event of frame.events) {
      switch (event.type) {
        case 'CHAMPION_KILL':
          this.processChampionKill(event as ChampionKillEvent, data, participantMap);
          break;

        case 'WARD_PLACED':
          this.processWardPlaced(event as WardPlacedEvent, data, participantMap);
          break;

        case 'WARD_KILL':
          this.processWardKill(event as WardKillEvent, data, participantMap);
          break;

        case 'ITEM_PURCHASED':
          this.processItemPurchased(event as ItemPurchasedEvent, data, participantMap);
          break;

        case 'ITEM_SOLD':
          this.processItemSold(event as ItemSoldEvent, data, participantMap);
          break;

        case 'ITEM_UNDO':
          this.processItemUndo(event as ItemUndoEvent, data, participantMap);
          break;

        case 'SKILL_LEVEL_UP':
          this.processSkillLevelUp(event as SkillLevelUpEvent, data, participantMap);
          break;

        case 'ELITE_MONSTER_KILL':
          this.processEliteMonsterKill(
            event as EliteMonsterKillEvent,
            data,
            participantMap,
            objectivesTimeline,
          );
          break;

        case 'BUILDING_KILL':
          this.processBuildingKill(
            event as BuildingKillEvent,
            data,
            participantMap,
            objectivesTimeline,
          );
          break;

        // Outros eventos não precisam ser processados individualmente
        // (LEVEL_UP, GAME_END, PAUSE_END, etc.)
      }
    }
  }

  /**
   * Processa evento de kill - registra posição de kill para killer e death para victim
   */
  private processChampionKill(
    event: ChampionKillEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const killerPuuid = participantMap.get(event.killerId);
    const victimPuuid = participantMap.get(event.victimId);

    // Registrar kill (se não for minion/torre)
    if (killerPuuid && event.killerId !== 0) {
      data.get(killerPuuid)?.killPositions.push({
        x: event.position.x,
        y: event.position.y,
        timestamp: event.timestamp,
      });
    }

    // Registrar death
    if (victimPuuid) {
      data.get(victimPuuid)?.deathPositions.push({
        x: event.position.x,
        y: event.position.y,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Processa evento de ward colocada
   */
  private processWardPlaced(
    event: WardPlacedEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const puuid = participantMap.get(event.creatorId);
    if (!puuid) return;

    // Ward event não tem posição no evento, precisaria buscar no participantFrame
    // Por enquanto, registramos sem posição
    const participant = data.get(puuid);
    if (!participant) return;

    // Nota: WardPlacedEvent não tem position, apenas timestamp
    // Para posição exata, seria necessário buscar no participantFrame do mesmo timestamp
    participant.wardPositions.push({
      x: 0,
      y: 0,
      timestamp: event.timestamp,
      wardType: event.wardType,
    });
  }

  /**
   * Processa evento de ward destruída
   */
  private processWardKill(
    event: WardKillEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    // Ward kill pode ser usado para calcular vision score
    // Por enquanto, apenas logamos
    const puuid = participantMap.get(event.killerId);
    if (!puuid) return;

    // Poderíamos rastrear wards destruídas para cálculo de vision score
  }

  /**
   * Processa evento de compra de item
   */
  private processItemPurchased(
    event: ItemPurchasedEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const puuid = participantMap.get(event.participantId);
    if (!puuid) return;

    data.get(puuid)?.itemTimeline.push({
      itemId: event.itemId,
      timestamp: event.timestamp,
      type: 'BUY',
    });
  }

  /**
   * Processa evento de venda de item
   */
  private processItemSold(
    event: ItemSoldEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const puuid = participantMap.get(event.participantId);
    if (!puuid) return;

    data.get(puuid)?.itemTimeline.push({
      itemId: event.itemId,
      timestamp: event.timestamp,
      type: 'SELL',
    });
  }

  /**
   * Processa evento de ITEM_UNDO (compra desfeita na base)
   * ⚠️ CRÍTICO: Remove o último ITEM_PURCHASED correspondente
   */
  private processItemUndo(
    event: ItemUndoEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const puuid = participantMap.get(event.participantId);
    if (!puuid) return;

    const participant = data.get(puuid);
    if (!participant) return;

    // Encontrar o último ITEM_PURCHASED do mesmo beforeId
    const itemTimeline = participant.itemTimeline;
    let lastIndex = -1;

    // Procurar de trás para frente
    for (let i = itemTimeline.length - 1; i >= 0; i--) {
      if (itemTimeline[i].itemId === event.beforeId && itemTimeline[i].type === 'BUY') {
        lastIndex = i;
        break;
      }
    }

    // Remover o item encontrado
    if (lastIndex >= 0) {
      itemTimeline.splice(lastIndex, 1);
    }

    // Adicionar evento UNDO para rastreamento (opcional)
    itemTimeline.push({
      itemId: event.beforeId,
      timestamp: event.timestamp,
      type: 'UNDO',
    });
  }

  /**
   * Processa evento de level up de skill
   */
  private processSkillLevelUp(
    event: SkillLevelUpEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
  ): void {
    const puuid = participantMap.get(event.participantId);
    if (!puuid) return;

    const skillLetter = skillSlotToLetter(event.skillSlot);
    data.get(puuid)?.skillOrder.push(skillLetter);
  }

  /**
   * Processa evento de kill de monstro épico (dragão, baron, herald)
   */
  private processEliteMonsterKill(
    event: EliteMonsterKillEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
    objectivesTimeline: ObjectiveEvent[],
  ): void {
    objectivesTimeline.push({
      type: event.monsterType,
      subType: event.monsterSubType || undefined,
      teamId: event.killerTeamId,
      timestamp: event.timestamp,
      killerId: event.killerId,
    });
  }

  /**
   * Processa evento de destruição de building (torre/inibidor)
   */
  private processBuildingKill(
    event: BuildingKillEvent,
    data: Map<string, ParticipantTimelineData>,
    participantMap: Map<number, string>,
    objectivesTimeline: ObjectiveEvent[],
  ): void {
    objectivesTimeline.push({
      type: event.buildingType === 'INHIBITOR_BUILDING' ? 'INHIBITOR' : 'TOWER',
      subType: event.laneType,
      teamId: event.teamId,
      timestamp: event.timestamp,
      killerId: event.killerId,
    });
  }
}
