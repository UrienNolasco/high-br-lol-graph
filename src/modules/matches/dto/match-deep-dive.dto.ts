import { ApiProperty } from '@nestjs/swagger';

// ========== Gold Timeline ==========

export class GoldCoverageDto {
  @ApiProperty({ example: 5 }) validSamples: number;
  @ApiProperty({ example: 5 }) totalSamples: number;
  @ApiProperty({ type: Number, nullable: true, example: 1 }) coverage:
    | number
    | null;
  @ApiProperty({ example: 0 }) unknownEvents: number;
  @ApiProperty({ type: [String], example: [] }) reconciliationIssues: string[];
}

export class TeamGoldCoverageDto {
  @ApiProperty({ type: GoldCoverageDto }) blueTeam: GoldCoverageDto;
  @ApiProperty({ type: GoldCoverageDto }) redTeam: GoldCoverageDto;
}

export class TeamGoldMissingReasonsDto {
  @ApiProperty({ type: String, nullable: true, example: null }) blueTeam:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, example: 'missing_frame' })
  redTeam: string | null;
}

export class GoldDifferenceEntryDto {
  @ApiProperty({
    example: 5,
    description: 'Índice de minuto legado; não é timestamp exato do frame.',
  })
  minute: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 15200,
    description: 'Soma em ouro dos 5 jogadores azuis; null se incompleta.',
  })
  blueTeam: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 14800,
    description: 'Soma em ouro dos 5 jogadores vermelhos; null se incompleta.',
  })
  redTeam: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 400,
    description:
      'blueTeam - redTeam; cálculo derivado, null quando um total está ausente.',
  })
  difference: number | null;
  @ApiProperty({ type: String, nullable: true, example: null }) reason:
    | string
    | null;
  @ApiProperty({ type: TeamGoldCoverageDto }) coverage: TeamGoldCoverageDto;
  @ApiProperty({ type: TeamGoldMissingReasonsDto })
  missingReasons: TeamGoldMissingReasonsDto;
}

export class MaxAdvantageDto {
  @ApiProperty({
    example: 15,
    description: 'Primeiro minuto válido com a maior magnitude observada.',
  })
  minute: number;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['blueTeam', 'redTeam'],
    description: 'null quando todas as diferenças válidas são zero (empate).',
  })
  team: string | null;
  @ApiProperty({
    example: 3000,
    description: 'abs(blueTeam - redTeam), em ouro.',
  })
  difference: number;
}

export class ObservedSwingDto {
  @ApiProperty({
    example: 18,
    description: 'Minuto posterior da primeira variação observada > 3000 ouro.',
  })
  minute: number;
  @ApiProperty({ example: 17 }) beforeMinute: number;
  @ApiProperty({ example: 2500 }) beforeDifference: number;
  @ApiProperty({ example: -1500 }) afterDifference: number;
  @ApiProperty({
    example: 4000,
    description:
      'abs(afterDifference - beforeDifference); não atribui culpa nem causalidade.',
  })
  swing: number;
}

/** @deprecated Use ObservedSwingDto. */
export class ThrowPointDto extends ObservedSwingDto {}

export class GoldTeamEvidenceDto {
  @ApiProperty({ example: 100 }) teamId: number;
  @ApiProperty({ example: true }) win: boolean;
}

export class GoldEvidenceDto {
  @ApiProperty({ example: 'MatchTeam.win' }) winnerSource: string;
  @ApiProperty({ type: [GoldTeamEvidenceDto] }) teams: GoldTeamEvidenceDto[];
  @ApiProperty({ example: 'MatchParticipant.goldGraph' }) goldSource: string;
  @ApiProperty({ example: '16.2.741.8224' }) gameVersion: string;
  @ApiProperty({ example: 11 }) mapId: number;
  @ApiProperty({ example: 5 }) expectedParticipantsPerTeam: number;
  @ApiProperty({ example: 'legacy_minute_index' }) timeBasis: string;
  @ApiProperty({ example: 3000 }) swingThresholdGold: number;
  @ApiProperty({
    example: 39,
    description:
      'Pares adjacentes completos avaliados; lacunas não são interpoladas.',
  })
  validAdjacentPairs: number;
}

export class MatchGoldTimelineDto {
  @ApiProperty({ example: 'BR1_3216549870' }) matchId: string;
  @ApiProperty({ example: 'O08' }) metricId: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({
    type: [GoldDifferenceEntryDto],
    description:
      'Totais derivados do ouro observado por minuto; nenhuma ausência vira zero.',
  })
  goldDifference: GoldDifferenceEntryDto[];
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['blueTeam', 'redTeam'],
    description:
      'Vencedor observado no resumo MatchTeam.win, independentemente do ouro. null se ausente ou contraditório.',
  })
  winner: string | null;
  @ApiProperty({ type: String, nullable: true }) winnerReason: string | null;
  @ApiProperty({ type: MaxAdvantageDto, nullable: true })
  maxAdvantage: MaxAdvantageDto | null;
  @ApiProperty({ type: String, nullable: true }) maxAdvantageReason:
    | string
    | null;
  @ApiProperty({ type: ObservedSwingDto, nullable: true })
  observedSwing: ObservedSwingDto | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'not_observed: nenhum par válido excede limiar; missing_frame: nenhum par válido; unsupported_version: formato de mapa não suportado.',
  })
  observedSwingReason: string | null;
  @ApiProperty({
    type: ThrowPointDto,
    nullable: true,
    deprecated: true,
    description:
      'Alias exato de observedSwing mantido para migração; não significa erro, culpa ou causa da derrota.',
  })
  throwPoint: ThrowPointDto | null;
  @ApiProperty({
    type: GoldCoverageDto,
    description:
      'Minutos com ambos os totais completos / índices presentes. Não mede cobertura temporal integral da partida.',
  })
  coverage: GoldCoverageDto;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Motivo de série indisponível. Série parcialmente válida usa cobertura e motivos por minuto.',
  })
  reason: string | null;
  @ApiProperty({ type: GoldEvidenceDto }) evidence: GoldEvidenceDto;
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
  @ApiProperty({
    example: 'DRAGON',
    description: 'Tipo de objetivo (DRAGON, BARON_NASHOR, TOWER, RIFTHERALD)',
  })
  type: string;

  @ApiProperty({
    example: 'FIRE_DRAGON',
    required: false,
    description: 'Subtipo do objetivo',
  })
  subType?: string;

  @ApiProperty({
    example: 100,
    description: 'Time que capturou (100=Blue, 200=Red)',
  })
  teamId: number;

  @ApiProperty({ example: 900000 })
  timestamp: number;

  @ApiProperty({ example: 15 })
  minute: number;

  @ApiProperty({
    example: 1,
    required: false,
    description: 'ID do participante que executou',
  })
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

  @ApiProperty({
    type: [ItemEventDto],
    description: 'Timeline completa de compras/vendas',
  })
  itemTimeline: ItemEventDto[];

  @ApiProperty({
    type: [FinalItemDto],
    description: 'Build final (últimos 6 itens comprados)',
  })
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

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 720.5,
    description: 'Dano por minuto',
  })
  dpm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 450.2,
    description: 'Ouro por minuto',
  })
  gpm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8.1,
    description: 'CS por minuto',
  })
  cspm: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.83,
    description: 'Vision score por minuto',
  })
  visionScorePerMin: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 615.2,
    description: 'Dano recebido por minuto; ausência resulta null',
  })
  damageTakenPerMin: number | null;

  @ApiProperty({ example: 6.0, description: 'KDA' })
  kda: number;
  @ApiProperty({ type: Object, description: 'Motivos de ausência das taxas' })
  reasons?: Record<string, string>;
}

export class OpponentMetricsDto extends PerformanceMetricsDto {
  @ApiProperty({ example: 'xyz789' })
  puuid: string;
}

export class ComparisonDto {
  @ApiProperty({ type: Number, nullable: true, example: 70.2 })
  dpmAdvantage: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 10.8 })
  dpmAdvantagePercent: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 29.4 })
  gpmAdvantage: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 7.0 })
  gpmAdvantagePercent: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.6 })
  cspmAdvantage: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 8.0 })
  cspmAdvantagePercent: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.16 })
  visionAdvantage: number | null;

  @ApiProperty({
    example: -49.8,
    description: 'Removido: dano recebido não mede sobrevivência',
    deprecated: true,
    nullable: true,
    type: Number,
  })
  survivability: null;
  @ApiProperty({ example: 'not_a_survivability_measure' })
  survivabilityReason: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Dano recebido/min jogador menos adversário, sem atribuir valor positivo/negativo ao desempenho',
  })
  damageTakenPerMinDifference: number | null;
  @ApiProperty({
    type: Object,
    description: 'Motivos de ausência por percentual',
  })
  reasons: Record<string, string>;
}

export class MatchPerformanceComparisonDto {
  @ApiProperty({ example: 1 })
  metricVersion?: number;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['missing_opponent', 'ambiguous_role'],
  })
  opponentReason?: string | null;
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ example: 'abc123' })
  puuid: string;

  @ApiProperty({ type: PerformanceMetricsDto })
  player: PerformanceMetricsDto;

  @ApiProperty({
    type: OpponentMetricsDto,
    nullable: true,
    description: 'Oponente de lane (null se não identificado)',
  })
  opponent: OpponentMetricsDto | null;

  @ApiProperty({
    type: ComparisonDto,
    nullable: true,
    description: 'Comparação (null se oponente não identificado)',
  })
  comparison: ComparisonDto | null;
}
