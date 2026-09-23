import { ApiProperty } from '@nestjs/swagger';
import { MetricResultDto } from '../../../core/metrics/metric-result.dto';
export class CombatCountsDto {
  @ApiProperty({ type: MetricResultDto }) kills: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) deaths: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) assists: MetricResultDto;
}
export class CombatRewardsDto {
  @ApiProperty({ type: MetricResultDto }) bountyReceived: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) bountyOnDeaths: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) shutdownReceived: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) shutdownOnDeaths: MetricResultDto;
}
export class CombatParticipantDto {
  @ApiProperty() puuid: string;
  @ApiProperty() teamId: number;
  @ApiProperty({
    type: Object,
    description:
      'K/D/A finais observados em MatchParticipant; KDA legado usa max(1,deaths)',
  })
  summary: object;
  @ApiProperty({ type: CombatCountsDto }) events: CombatCountsDto;
  @ApiProperty({
    type: Object,
    description:
      'Por campo: observedCount, summaryCount, difference, matches e complete. Contagem observada parcial não converte assistências desconhecidas em zero.',
  })
  reconciliation: object;
  @ApiProperty({
    type: MetricResultDto,
    description: 'KP total a partir do resumo final, distinto do KP temporal',
  })
  kpTotal: MetricResultDto;
  @ApiProperty({
    type: [MetricResultDto],
    description:
      'Fases [0,10),[10,15),[15,20),[20,fim]; última inclui GAME_END. Valores nulos quando assistência relevante é desconhecida.',
  })
  kpByPhase: MetricResultDto[];
  @ApiProperty({ type: MetricResultDto }) soloKills10: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) soloDeaths10: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) soloKills15: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) soloDeaths15: MetricResultDto;
  @ApiProperty({ type: CombatRewardsDto }) rewards: CombatRewardsDto;
}
export class KillerVictimEdgeDto {
  @ApiProperty({ type: MetricResultDto }) metric: MetricResultDto;
  @ApiProperty() killerPuuid: string;
  @ApiProperty() victimPuuid: string;
  @ApiProperty({
    description: 'Contagem de identidades de eventos distintas, não timestamps',
  })
  count: number;
  @ApiProperty({
    type: [Object],
    description:
      'Referências matchId:frameIndex:eventIndex, timestamp e campo observado',
  })
  evidence: object[];
}
export class CoParticipationEdgeDto {
  @ApiProperty({ type: MetricResultDto }) metric: MetricResultDto;
  @ApiProperty() participantA: string;
  @ApiProperty() participantB: string;
  @ApiProperty({
    description:
      'Abates em que o par teve participação registrada; uma vez por evento',
  })
  count: number;
  @ApiProperty({ type: [Object] }) evidence: object[];
}
export class MatchCombatDto {
  @ApiProperty() matchId: string;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  processedAt: string | null;
  @ApiProperty() source: string;
  @ApiProperty({ type: Object, nullable: true }) window: object | null;
  @ApiProperty({
    type: Object,
    description:
      'Disponibilidade, eventos únicos, assistência desconhecida, autores ambientais, versões e discrepâncias',
  })
  quality: object;
  @ApiProperty({ type: Object }) cohort: object;
  @ApiProperty({ type: [CombatParticipantDto] })
  participants: CombatParticipantDto[];
  @ApiProperty({ type: [KillerVictimEdgeDto] })
  killerVictimMatrix: KillerVictimEdgeDto[];
  @ApiProperty({ type: [CoParticipationEdgeDto] })
  coParticipation: CoParticipationEdgeDto[];
  @ApiProperty({
    description:
      'Relações registradas, sem inferência de premade/intenções; ausência de aresta não prova ausência de relação',
  })
  relationSemantics: string;
}
