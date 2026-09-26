import {
  normalizeTimelineEvents,
  KNOWN_EVENT_TYPES,
} from './normalized-events';
import type { KnownTimelineEvent } from './dto/timeline.dto';
import { Injectable, Logger } from '@nestjs/common';
import {
  projectTimelineSnapshots,
  legacyMinuteGraphs,
} from './timeline-snapshots';
import type {
  ItemEvent,
  ObjectiveEvent,
  ParsedTimelineData,
  ParticipantTimelineData,
} from '../../modules/matches/contracts/normalized-timeline';

/** @deprecated Import canonical types from modules/matches/contracts. */
export type {
  ItemEvent,
  ObjectiveEvent,
  ParsedTimelineData,
  ParticipantTimelineData,
  PathPoint,
  PositionEvent,
  WardEvent,
} from '../../modules/matches/contracts/normalized-timeline';
import { skillSlotToLetter } from './dto/timeline.dto';
import type {
  TimelineDto,
  TimelineFrame,
  ChampionKillEvent,
  WardPlacedEvent,
  WardKillEvent,
  ItemPurchasedEvent,
  ItemSoldEvent,
  ItemUndoEvent,
  SkillLevelUpEvent,
  EliteMonsterKillEvent,
  BuildingKillEvent,
} from './dto/timeline.dto';

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
    participantTeams: ReadonlyMap<number, number> = new Map(),
  ): ParsedTimelineData {
    const frames = timelineDto.info.frames;
    const snapshotProjection = projectTimelineSnapshots(
      timelineDto,
      participantMap,
    );
    const totalMinutes = Math.ceil(
      frames[frames.length - 1]?.timestamp / 60000 || 40,
    );

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
      this.extractEvents(
        frame,
        participantData,
        participantMap,
        objectivesTimeline,
      );
    }

    for (const [puuid, participant] of participantData)
      Object.assign(participant, legacyMinuteGraphs(snapshotProjection, puuid));
    return {
      snapshotProjection,
      participants: participantData,
      objectivesTimeline,
      normalizedEvents: normalizeTimelineEvents(
        timelineDto,
        participantMap,
        participantTeams,
      ),
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
        goldGraph: new Array<number>(totalMinutes).fill(0),
        xpGraph: new Array<number>(totalMinutes).fill(0),
        csGraph: new Array<number>(totalMinutes).fill(0),
        damageGraph: new Array<number>(totalMinutes).fill(0),
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
      participant.damageGraph[minute] =
        pf.damageStats?.totalDamageDoneToChampions ?? 0;

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
    for (const sourceEvent of frame.events) {
      if (!KNOWN_EVENT_TYPES.has(sourceEvent.type)) continue;
      const event = sourceEvent as KnownTimelineEvent;
      switch (event.type) {
        case 'CHAMPION_KILL':
          this.processChampionKill(event, data, participantMap);
          break;

        case 'WARD_PLACED':
          this.processWardPlaced(event, data, participantMap);
          break;

        case 'WARD_KILL':
          this.processWardKill(event, data, participantMap);
          break;

        case 'ITEM_PURCHASED':
          this.processItemPurchased(event, data, participantMap);
          break;

        case 'ITEM_SOLD':
          this.processItemSold(event, data, participantMap);
          break;

        case 'ITEM_UNDO':
          this.processItemUndo(event, data, participantMap);
          break;

        case 'SKILL_LEVEL_UP':
          this.processSkillLevelUp(event, data, participantMap);
          break;

        case 'ELITE_MONSTER_KILL':
          this.processEliteMonsterKill(
            event,
            data,
            participantMap,
            objectivesTimeline,
          );
          break;

        case 'BUILDING_KILL':
          this.processBuildingKill(
            event,
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

    // A kill without observed coordinates still exists in normalizedEvents, but has no heatmap point.
    if (
      !event.position ||
      !Number.isFinite(event.position.x) ||
      !Number.isFinite(event.position.y)
    )
      return;

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

    const participant = data.get(puuid);
    if (!participant) return;

    // Only event coordinates are observed ward locations; never use the actor frame.
    participant.wardPositions.push({
      x:
        typeof event.position?.x === 'number' &&
        Number.isFinite(event.position.x)
          ? event.position.x
          : null,
      y:
        typeof event.position?.y === 'number' &&
        Number.isFinite(event.position.y)
          ? event.position.y
          : null,
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
      if (
        itemTimeline[i].itemId === event.beforeId &&
        itemTimeline[i].type === 'BUY'
      ) {
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
      teamId: [100, 200].includes(event.killerTeamId)
        ? event.killerTeamId
        : null,
      assistingParticipantIds: event.assistingParticipantIds ?? null,
      timestamp: event.timestamp,
      killerId:
        event.killerId > 0 && participantMap.has(event.killerId)
          ? event.killerId
          : undefined,
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
      teamId: event.teamId === 100 ? 200 : event.teamId === 200 ? 100 : null,
      ownerTeamId: [100, 200].includes(event.teamId) ? event.teamId : null,
      lane: event.laneType ?? null,
      tier: event.towerType ?? null,
      assistingParticipantIds: event.assistingParticipantIds ?? null,
      timestamp: event.timestamp,
      killerId:
        event.killerId > 0 && participantMap.has(event.killerId)
          ? event.killerId
          : undefined,
    });
  }
}
