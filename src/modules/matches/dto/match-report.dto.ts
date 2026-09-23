import { ApiProperty } from '@nestjs/swagger';
export class ReportPageDto {
  @ApiProperty({
    type: [Object],
    description:
      'Bounded items. Nested collections use the same page envelope.',
  })
  items: unknown[];
  @ApiProperty() total: number;
  @ApiProperty() offset: number;
  @ApiProperty({ maximum: 50 }) limit: number;
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ type: String, nullable: true }) next: string | null;
}
export class ReportMetricDto {
  @ApiProperty() key: string;
  @ApiProperty() metricId: string;
  @ApiProperty() metricVersion: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Null when processing provenance is unknown; observed final totals remain readable.',
  })
  processingVersion: number | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: Number, nullable: true }) value: number | null;
  @ApiProperty() unit: string;
  @ApiProperty({ enum: ['observed', 'derived', 'estimated', 'unavailable'] })
  origin: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: Object, nullable: true }) denominator: unknown;
  @ApiProperty({ type: Object, nullable: true }) window: unknown;
  @ApiProperty({ type: Object }) quality: unknown;
  @ApiProperty({ type: ReportPageDto }) evidence: ReportPageDto;
  @ApiProperty({ type: String, nullable: true }) href: string | null;
}
export class ReportDimensionDto {
  @ApiProperty({ enum: ['resources', 'combat', 'vision', 'structures'] })
  id: string;
  @ApiProperty() label: string;
  @ApiProperty({
    enum: [1],
    description: 'Equal presentation priority, never a score weight.',
  })
  presentationWeight: number;
  @ApiProperty({ type: [ReportMetricDto] }) metrics: ReportMetricDto[];
}
export class MatchReportDto {
  @ApiProperty({ enum: [1] }) schemaVersion: number;
  @ApiProperty() matchId: string;
  @ApiProperty({ type: Object }) participant: unknown;
  @ApiProperty({ type: Object }) context: unknown;
  @ApiProperty({
    type: Object,
    description: 'Known processing version/date or explicit null with reason.',
  })
  provenance: unknown;
  @ApiProperty({
    type: Object,
    description:
      'status: available, partial, unavailable; separate processing/events/frames reasons.',
  })
  availability: unknown;
  @ApiProperty({ type: [ReportDimensionDto], minItems: 4, maxItems: 4 })
  dimensions: ReportDimensionDto[];
  @ApiProperty({ type: [ReportMetricDto] }) finalTotals: ReportMetricDto[];
  @ApiProperty({
    type: [Object],
    description: 'Family availability and allowlisted section links.',
  })
  families: unknown[];
  @ApiProperty({ type: Object }) episodes: unknown;
  @ApiProperty({ type: Object }) readLimits: unknown;
  @ApiProperty({ type: Object }) payloadPolicy: unknown;
}
export class ReportFamilyDto {
  @ApiProperty() family: string;
  @ApiProperty() section: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: Object }) metadata: unknown;
  @ApiProperty({ type: Object }) filters: unknown;
  @ApiProperty({ type: Object }) readLimits: unknown;
  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'Selected section/path. Every collection has items,total,offset,limit,hasMore,next; metrics link to evidence.',
  })
  data: unknown;
}
export class ReportEpisodesDto {
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: ReportPageDto }) page: ReportPageDto;
}
export class ReportEvidenceDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) processedAt: string | null;
  @ApiProperty({ type: String, required: false }) eventHref?: string;
}
