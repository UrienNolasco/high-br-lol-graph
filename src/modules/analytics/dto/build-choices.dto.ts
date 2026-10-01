import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class BuildChoicesQueryDto {
  @ApiProperty({
    example: '16.2',
    description:
      'Exact internal major.minor gameVersion patch; ALL is forbidden',
  })
  patch: string;
  @ApiProperty({ example: 1, minimum: 1 }) championId: number;
  @ApiProperty({
    enum: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'],
    example: 'TOP',
  })
  role: string;
  @ApiPropertyOptional({ default: 900000, minimum: 60000, maximum: 3600000 })
  checkpointMs?: number;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Unique opponent in the same known position',
  })
  opponentChampionId?: number;
  @ApiPropertyOptional({ default: 420, minimum: 1 }) queueId?: number;
  @ApiPropertyOptional({
    minimum: 0,
    description: 'Inclusive gameCreation milliseconds',
  })
  fromMs?: number;
  @ApiPropertyOptional({
    minimum: 0,
    description: 'Exclusive gameCreation milliseconds',
  })
  toMs?: number;
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 500 })
  limit?: number;
}
export class ChoiceIntervalDto {
  @ApiProperty({ minimum: 0, maximum: 1 }) lower: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) upper: number;
}
export class ChoiceOutcomeDto {
  @ApiProperty({ description: 'Distinct observed matches' }) n: number;
  @ApiProperty({ description: 'Distinct observed players' }) players: number;
  @ApiProperty() wins: number;
  @ApiProperty({ type: Number, nullable: true }) winRate: number | null;
  @ApiProperty({
    type: ChoiceIntervalDto,
    nullable: true,
    description:
      'Nominal95% Wilson under independence; repeated players and selection remain',
  })
  interval95: ChoiceIntervalDto | null;
  @ApiProperty({ description: 'N>=30; descriptive precision policy version1' })
  sufficient: boolean;
}
export class ChoiceMetadataDto {
  @ApiProperty() id: number;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Stat shards are absent from runesReforged',
  })
  reason: string | null;
}
export class ChoiceEvidenceDto {
  @ApiProperty({ type: Number, nullable: true }) acquisitionFrameTimestampMs:
    | number
    | null;
  @ApiProperty() processingVersion: number;
  @ApiProperty() processedAt: string;
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty() frameTimestampMs: number;
  @ApiProperty({
    description: 'No choice or resource evidence after this timestamp',
  })
  sourceMaxTimestampMs: number;
  @ApiProperty({ type: String, nullable: true }) eventId: string | null;
}
export class AcquisitionResourcesDto {
  @ApiProperty() validN: number;
  @ApiProperty() totalN: number;
  @ApiProperty({ type: Number, nullable: true }) meanTotalGold: number | null;
  @ApiProperty({ type: Number, nullable: true }) meanCurrentGold: number | null;
  @ApiProperty({ type: String, nullable: true }) missingReason: string | null;
}
export class ChoiceAlternativeDto extends ChoiceOutcomeDto {
  @ApiProperty({
    type: AcquisitionResourcesDto,
    nullable: true,
    description:
      'Resources at last past frame within60s of first effective acquisition; separate coverage',
  })
  acquisitionResources: AcquisitionResourcesDto | null;
  @ApiProperty() choiceKey: string;
  @ApiProperty({ type: [Number] }) ids: number[];
  @ApiProperty({
    description:
      'All context matches with known family choices, including nonbuyers',
  })
  denominatorN: number;
  @ApiProperty() share: number;
  @ApiProperty({
    type: ChoiceOutcomeDto,
    description: 'Same context with this choice absent; not a causal control',
  })
  comparison: ChoiceOutcomeDto;
  @ApiProperty({ type: Number, nullable: true }) meanTotalGold: number | null;
  @ApiProperty({ type: Number, nullable: true }) meanCurrentGold: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'First effective observed acquisition by checkpoint, milliseconds',
  })
  meanAcquisitionMs: number | null;
  @ApiProperty({ type: [ChoiceMetadataDto] }) metadata: ChoiceMetadataDto[];
  @ApiProperty({ type: [String] }) catalogVersions: string[];
  @ApiProperty({
    type: [ChoiceEvidenceDto],
    description: 'Up to3 illustrative matches; complete N is separate',
  })
  evidence: ChoiceEvidenceDto[];
}
export class ChoiceAlternativesDto {
  @ApiProperty({ type: [ChoiceAlternativeDto] }) items: ChoiceAlternativeDto[];
  @ApiProperty({ type: [ChoiceAlternativeDto] }) runes: ChoiceAlternativeDto[];
  @ApiProperty({ type: [ChoiceAlternativeDto] })
  summoners: ChoiceAlternativeDto[];
}
export class GoldBandDto {
  @ApiProperty() lower: number;
  @ApiProperty() upperExclusive: number;
}
export class ChoiceDenominatorsDto {
  @ApiProperty() items: number;
  @ApiProperty() runes: number;
  @ApiProperty() summoners: number;
}
export class ChoiceContextDto {
  @ApiProperty() opponentChampionId: number;
  @ApiProperty({ type: GoldBandDto }) goldBin: GoldBandDto;
  @ApiProperty() n: number;
  @ApiProperty({ type: ChoiceOutcomeDto }) baseline: ChoiceOutcomeDto;
  @ApiProperty({ type: ChoiceDenominatorsDto })
  denominators: ChoiceDenominatorsDto;
  @ApiProperty({ type: ChoiceAlternativesDto })
  alternatives: ChoiceAlternativesDto;
}
export class ChoiceCoverageDto {
  @ApiProperty({ type: [Number] }) processingVersions: number[];
  @ApiProperty() queriedMatches: number;
  @ApiProperty() returnedMatches: number;
  @ApiProperty() eligibleMatches: number;
  @ApiProperty() players: number;
  @ApiProperty() truncated: boolean;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  exclusions: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  missingness: Record<string, number>;
}
export class ChoiceCheckpointDto {
  @ApiProperty() targetMs: number;
  @ApiProperty({ enum: ['pastOnly'] }) mode: string;
  @ApiProperty() toleranceMs: number;
  @ApiProperty() resourceGoldBinWidth: number;
  @ApiProperty() minimumDescriptiveN: number;
}
export class ChoiceCatalogStatusDto {
  @ApiProperty({ type: String, nullable: true }) version: string | null;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
}
export class ChoiceCatalogVersionsDto {
  @ApiProperty() gameVersion: string;
  @ApiProperty({ type: ChoiceCatalogStatusDto }) items: ChoiceCatalogStatusDto;
  @ApiProperty({ type: ChoiceCatalogStatusDto })
  choices: ChoiceCatalogStatusDto;
}
export class BuildChoicesResultDto {
  @ApiProperty() methodVersion: number;
  @ApiProperty({ type: [String] }) opportunities: string[];
  @ApiProperty({ type: BuildChoicesQueryDto }) filters: BuildChoicesQueryDto;
  @ApiProperty({ type: ChoiceCoverageDto }) coverage: ChoiceCoverageDto;
  @ApiProperty({ type: ChoiceCheckpointDto }) checkpoint: ChoiceCheckpointDto;
  @ApiProperty({ type: [ChoiceCatalogVersionsDto] })
  catalogs: ChoiceCatalogVersionsDto[];
  @ApiProperty({ type: [ChoiceContextDto] }) contexts: ChoiceContextDto[];
  @ApiProperty() interpretation: string;
  @ApiProperty() uncertainty: string;
}
