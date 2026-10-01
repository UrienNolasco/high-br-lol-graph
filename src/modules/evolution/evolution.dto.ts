import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class EvolutionQueryDto {
  @ApiProperty({ example: 'final.deathsNearObjectives' }) definitionId!: string;
  @ApiProperty({ example: 114 }) championId!: number;
  @ApiProperty({ example: 'TOP' }) role!: string;
  @ApiProperty({ example: 420 }) queueId!: number;
  @ApiProperty({ example: 11 }) mapId!: number;
  @ApiProperty({ example: 'final' }) horizonKey!: string;
  @ApiPropertyOptional({ example: '16.2' }) patch?: string;
  @ApiProperty({
    description: 'Inclusive epoch milliseconds',
    example: 1767225600000,
  })
  baselineFromMs!: number;
  @ApiProperty({
    description: 'Exclusive epoch milliseconds',
    example: 1769904000000,
  })
  baselineToMs!: number;
  @ApiProperty({
    description: 'Inclusive epoch milliseconds',
    example: 1769904000000,
  })
  recentFromMs!: number;
  @ApiProperty({
    description: 'Exclusive epoch milliseconds',
    example: 1772323200000,
  })
  recentToMs!: number;
  @ApiPropertyOptional({ default: 0.95 }) confidence?: number;
  @ApiPropertyOptional({ default: 0.15 }) cdfHalfWidth?: number;
  @ApiPropertyOptional({ default: 0 }) minimumUnits?: number;
}
export class EvolutionResponseDto {
  @ApiProperty() methodVersion!: number;
  @ApiProperty() datasetVersion!: number;
  @ApiProperty() processingVersion!: number;
  @ApiProperty() puuid!: string;
  @ApiProperty({
    type: Object,
    description: 'Versioned definition, source and unit',
  })
  definition!: object;
  @ApiProperty({
    type: Object,
    description: 'Champion/role/queue/map fixed; optional exact patch',
  })
  filters!: object;
  @ApiProperty({
    type: Object,
    description:
      'baseline/recent: requested [) dates, N, observed absolute values, coverage, patch composition, C07 eligible/censored deaths, bounded episodes with event IDs, provenance and unavailable precision',
  })
  windows!: object;
  @ApiProperty({
    type: Object,
    description:
      'Recent minus baseline; pooled and matched-patch deltas; trend and inferential precision remain null',
  })
  comparison!: object;
  @ApiProperty({ type: [String] }) limitations!: string[];
}
