import { ApiProperty } from '@nestjs/swagger';

// ========== Gold Timeline ==========

export class GoldDifferenceEntryDto {
  @ApiProperty({ example: 5, description: 'Minuto da partida' })
  minute: number;

  @ApiProperty({ example: 15200, description: 'Ouro total do time azul (teamId 100)' })
  blueTeam: number;

  @ApiProperty({ example: 14800, description: 'Ouro total do time vermelho (teamId 200)' })
  redTeam: number;

  @ApiProperty({ example: 400, description: 'Diferença de ouro (blue - red). Positivo = vantagem azul' })
  difference: number;
}

export class MaxAdvantageDto {
  @ApiProperty({ example: 15, description: 'Minuto do pico de vantagem' })
  minute: number;

  @ApiProperty({ example: 'blueTeam', enum: ['blueTeam', 'redTeam'], description: 'Time com maior vantagem' })
  team: string;

  @ApiProperty({ example: 3000, description: 'Valor absoluto da vantagem de ouro' })
  difference: number;
}

export class ThrowPointDto {
  @ApiProperty({ example: 18, description: 'Minuto do throw' })
  minute: number;

  @ApiProperty({ example: 2500, description: 'Diferença antes do swing' })
  beforeDifference: number;

  @ApiProperty({ example: -1500, description: 'Diferença depois do swing' })
  afterDifference: number;

  @ApiProperty({ example: 4000, description: 'Magnitude do swing de ouro' })
  swing: number;
}

export class MatchGoldTimelineDto {
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ type: [GoldDifferenceEntryDto], description: 'Diferença de ouro por minuto' })
  goldDifference: GoldDifferenceEntryDto[];

  @ApiProperty({ example: 'redTeam', enum: ['blueTeam', 'redTeam'], description: 'Time vencedor em ouro final' })
  winner: string;

  @ApiProperty({ type: MaxAdvantageDto, description: 'Ponto de maior vantagem na partida' })
  maxAdvantage: MaxAdvantageDto;

  @ApiProperty({ type: ThrowPointDto, nullable: true, description: 'Ponto de virada (swing > 3k gold), null se não houve' })
  throwPoint: ThrowPointDto | null;
}

// ========== Timeline Events ==========

export class KillEventDto {
  @ApiProperty({ example: 'abc123' })
  puuid: string;

  @ApiProperty({ example: 157 })
  championId: number;

  @ApiProperty({ example: 5432, description: 'Posição X no mapa' })
  x: number;

  @ApiProperty({ example: 8765, description: 'Posição Y no mapa' })
  y: number;

  @ApiProperty({ example: 120000, description: 'Timestamp em ms' })
  timestamp: number;

  @ApiProperty({ example: 2, description: 'Minuto do evento' })
  minute: number;
}

export class DeathEventDto {
  @ApiProperty({ example: 'xyz789' })
  puuid: string;

  @ApiProperty({ example: 238 })
  championId: number;

  @ApiProperty({ example: 5450 })
  x: number;

  @ApiProperty({ example: 8780 })
  y: number;

  @ApiProperty({ example: 120000 })
  timestamp: number;

  @ApiProperty({ example: 2 })
  minute: number;
}

export class WardEventDto {
  @ApiProperty({ example: 'abc123' })
  puuid: string;

  @ApiProperty({ example: 'CONTROL_WARD' })
  wardType: string;

  @ApiProperty({ example: 6000 })
  x: number;

  @ApiProperty({ example: 9000 })
  y: number;

  @ApiProperty({ example: 60000 })
  timestamp: number;

  @ApiProperty({ example: 1 })
  minute: number;
}

export class ObjectiveEventDto {
  @ApiProperty({ example: 'DRAGON', description: 'Tipo de objetivo (DRAGON, BARON_NASHOR, TOWER, RIFTHERALD)' })
  type: string;

  @ApiProperty({ example: 'FIRE_DRAGON', required: false, description: 'Subtipo do objetivo' })
  subType?: string;

  @ApiProperty({ example: 100, description: 'Time que capturou (100=Blue, 200=Red)' })
  teamId: number;

  @ApiProperty({ example: 900000 })
  timestamp: number;

  @ApiProperty({ example: 15 })
  minute: number;

  @ApiProperty({ example: 1, required: false, description: 'ID do participante que executou' })
  killerId?: number;
}

export class TimelineEventsDataDto {
  @ApiProperty({ type: [KillEventDto] })
  kills: KillEventDto[];

  @ApiProperty({ type: [DeathEventDto] })
  deaths: DeathEventDto[];

  @ApiProperty({ type: [WardEventDto] })
  wards: WardEventDto[];

  @ApiProperty({ type: [ObjectiveEventDto] })
  objectives: ObjectiveEventDto[];
}

export class MatchTimelineEventsDto {
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ type: TimelineEventsDataDto })
  events: TimelineEventsDataDto;
}

// ========== Builds ==========

export class ItemEventDto {
  @ApiProperty({ example: 3031 })
  itemId: number;

  @ApiProperty({ example: 1080000 })
  timestamp: number;

  @ApiProperty({ example: 18, description: 'Minuto (timestamp / 60000)' })
  minute: number;

  @ApiProperty({ example: 'BUY', enum: ['BUY', 'SELL', 'UNDO'] })
  type: string;
}

export class FinalItemDto {
  @ApiProperty({ example: 3031 })
  itemId: number;
}

export class ParticipantBuildDto {
  @ApiProperty({ example: 'abc123' })
  puuid: string;

  @ApiProperty({ example: 157 })
  championId: number;

  @ApiProperty({ example: 'Yasuo' })
  championName: string;

  @ApiProperty({ type: [ItemEventDto], description: 'Timeline completa de compras/vendas' })
  itemTimeline: ItemEventDto[];

  @ApiProperty({ type: [FinalItemDto], description: 'Build final (últimos 6 itens comprados)' })
  finalBuild: FinalItemDto[];
}

export class MatchBuildsDto {
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ type: [ParticipantBuildDto] })
  builds: ParticipantBuildDto[];
}

// ========== Performance Comparison ==========

export class PerformanceMetricsDto {
  @ApiProperty({ example: 157 })
  championId: number;

  @ApiProperty({ example: 'Yasuo' })
  championName: string;

  @ApiProperty({ example: 'MID' })
  role: string;

  @ApiProperty({ example: 720.5, description: 'Dano por minuto' })
  dpm: number;

  @ApiProperty({ example: 450.2, description: 'Ouro por minuto' })
  gpm: number;

  @ApiProperty({ example: 8.1, description: 'CS por minuto' })
  cspm: number;

  @ApiProperty({ example: 0.83, description: 'Vision score por minuto' })
  visionScorePerMin: number;

  @ApiProperty({ example: 615.2, description: 'Dano recebido por minuto (0 se não disponível)' })
  damageTakenPerMin: number;

  @ApiProperty({ example: 6.0, description: 'KDA' })
  kda: number;
}

export class OpponentMetricsDto extends PerformanceMetricsDto {
  @ApiProperty({ example: 'xyz789' })
  puuid: string;
}

export class ComparisonDto {
  @ApiProperty({ example: 70.2 })
  dpmAdvantage: number;

  @ApiProperty({ example: 10.8 })
  dpmAdvantagePercent: number;

  @ApiProperty({ example: 29.4 })
  gpmAdvantage: number;

  @ApiProperty({ example: 7.0 })
  gpmAdvantagePercent: number;

  @ApiProperty({ example: 0.6 })
  cspmAdvantage: number;

  @ApiProperty({ example: 8.0 })
  cspmAdvantagePercent: number;

  @ApiProperty({ example: 0.16 })
  visionAdvantage: number;

  @ApiProperty({ example: -49.8, description: 'Diferença de dano recebido/min (positivo = mais tanky)' })
  survivability: number;
}

export class MatchPerformanceComparisonDto {
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ example: 'abc123' })
  puuid: string;

  @ApiProperty({ type: PerformanceMetricsDto })
  player: PerformanceMetricsDto;

  @ApiProperty({ type: OpponentMetricsDto, nullable: true, description: 'Oponente de lane (null se não identificado)' })
  opponent: OpponentMetricsDto | null;

  @ApiProperty({ type: ComparisonDto, nullable: true, description: 'Comparação (null se oponente não identificado)' })
  comparison: ComparisonDto | null;
}
