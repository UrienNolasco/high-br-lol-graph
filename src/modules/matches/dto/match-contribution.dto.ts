import { ApiProperty } from '@nestjs/swagger';
import { MetricResultDto } from './metric-result.dto';

export class ContributionMeasureDto {
  @ApiProperty({
    type: MetricResultDto,
    description:
      'Valor absoluto observado; CS total é soma explícita lane+jungle.',
  })
  absolute: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'valor / timePlayed em segundos * 60; null se tempo ausente/zero.',
  })
  perMinute: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      '100 * valor / soma do time completo; nunca soma ausências como zero.',
  })
  teamShare: MetricResultDto;
}
export class DamageTypeContributionDto {
  @ApiProperty({ type: MetricResultDto }) absolute: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description: 'Percentual desse tipo no dano total do próprio jogador.',
  })
  compositionPercent: MetricResultDto;
}
export class DamageCompositionDto {
  @ApiProperty({ type: DamageTypeContributionDto })
  physical: DamageTypeContributionDto;
  @ApiProperty({ type: DamageTypeContributionDto })
  magic: DamageTypeContributionDto;
  @ApiProperty({ type: DamageTypeContributionDto })
  true: DamageTypeContributionDto;
}
export class ResourceContributionDto {
  @ApiProperty({ type: ContributionMeasureDto }) gold: ContributionMeasureDto;
  @ApiProperty({ type: ContributionMeasureDto }) cs: ContributionMeasureDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      '100*maior ouro individual/soma do time; medida de distribuição, não justiça.',
  })
  teamGoldConcentration: MetricResultDto;
  @ApiProperty({
    type: [String],
    description:
      'PUUIDs empatados no maior ouro; vazio quando total ausente/zero.',
  })
  largestGoldHolders: string[];
}
export class CombatContributionDto {
  @ApiProperty({ type: MetricResultDto }) kills: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) assists: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description: '100*(kills+assists)/sum(team kills).',
  })
  killParticipation: MetricResultDto;
  @ApiProperty({ type: ContributionMeasureDto }) damage: ContributionMeasureDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      'damage share / gold share. Não é nota de eficiência universal.',
  })
  damageToGoldShareRatio: MetricResultDto;
  @ApiProperty({ type: DamageCompositionDto })
  damageDealtByType: DamageCompositionDto;
  @ApiProperty({
    type: ContributionMeasureDto,
    description:
      'Dano recebido, sem interpretação de sobrevivência ou mau desempenho.',
  })
  damageTaken: ContributionMeasureDto;
  @ApiProperty({ type: DamageCompositionDto })
  damageTakenByType: DamageCompositionDto;
  @ApiProperty({
    type: ContributionMeasureDto,
    description: 'Somente totalHealsOnTeammates; não inclui cura própria.',
  })
  allyHealing: ContributionMeasureDto;
  @ApiProperty({ type: ContributionMeasureDto })
  allyShielding: ContributionMeasureDto;
  @ApiProperty({
    type: ContributionMeasureDto,
    description: 'timeCCingOthers; não somar a totalTimeCCDealt.',
  })
  crowdControl: ContributionMeasureDto;
  @ApiProperty({ type: MetricResultDto }) deadTime: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) deadTimePercent: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description: 'Soma totalTimeSpentDead, unidade player_seconds.',
  })
  teamDeadTime: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description: 'Soma timePlayed, unidade player_seconds.',
  })
  teamTimePlayed: MetricResultDto;
  @ApiProperty({
    type: MetricResultDto,
    description:
      '100*sum(dead time)/sum(timePlayed); não divide a soma pela duração de um jogador.',
  })
  teamDeadTimePercent: MetricResultDto;
  @ApiProperty() interpretation: string;
}
export class VisionContributionDto {
  @ApiProperty({ type: ContributionMeasureDto }) score: ContributionMeasureDto;
  @ApiProperty({ type: ContributionMeasureDto })
  wardsPlaced: ContributionMeasureDto;
  @ApiProperty({ type: ContributionMeasureDto })
  wardsRemoved: ContributionMeasureDto;
  @ApiProperty() interpretation: string;
}
export class StructureContributionDto {
  @ApiProperty({ type: ContributionMeasureDto })
  turretDamage: ContributionMeasureDto;
  @ApiProperty({ type: MetricResultDto }) turretKills: MetricResultDto;
  @ApiProperty({ type: MetricResultDto }) turretTakedowns: MetricResultDto;
  @ApiProperty() interpretation: string;
}
export class ContributionDimensionsDto {
  @ApiProperty({ type: ResourceContributionDto })
  resources: ResourceContributionDto;
  @ApiProperty({ type: CombatContributionDto }) combat: CombatContributionDto;
  @ApiProperty({ type: VisionContributionDto }) vision: VisionContributionDto;
  @ApiProperty({ type: StructureContributionDto })
  structures: StructureContributionDto;
}
export class MatchContributionDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty() teamId: number;
  @ApiProperty() championId: number;
  @ApiProperty() championName: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Papel canônico; MID vira MIDDLE e papel desconhecido não é inventado.',
  })
  role: string | null;
  @ApiProperty({ type: String, nullable: true }) roleExplanation: string | null;
  @ApiProperty({ example: 1 }) metricVersion: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Geração real de MatchProcessing; null quando não rastreável.',
  })
  processingVersion: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Instante real de conclusão da projeção, não horário inventado pelo GET.',
  })
  processedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    type: ContributionDimensionsDto,
    nullable: true,
    description:
      'Quatro dimensões independentes, sem score universal. null se a projeção não tem processamento concluído rastreável.',
  })
  dimensions: ContributionDimensionsDto | null;
}
