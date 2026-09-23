import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { MetricResultDto } from '../../../core/metrics/metric-result.dto';
export class ProgressionEventDto {
  @ApiProperty() eventId: string;
  @ApiProperty() frameIndex: number;
  @ApiProperty() eventIndex: number;
  @ApiProperty({ type: String, nullable: true }) type: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Observed event timestamp in milliseconds',
  })
  timestampMs: number | null;
  @ApiProperty({
    type: Object,
    description:
      'Original event, including itemId, beforeId, afterId, goldGain, skillSlot and levelUpType when present; never removed by undo',
  })
  payload: object;
  @ApiProperty({ type: Object }) sourceQuality: object;
}
export class SkillAllocationDto {
  @ApiProperty() eventId: string;
  @ApiProperty() ordinal: number;
  @ApiProperty({ type: Number, nullable: true }) timestampMs: number | null;
  @ApiProperty({ type: Number, nullable: true }) skillSlot: number | null;
  @ApiProperty({ type: String, nullable: true }) levelUpType: string | null;
  @ApiProperty({ type: Number, nullable: true }) observedNormalRank:
    | number
    | null;
  @ApiProperty({ type: Object, nullable: true }) metadata: object | null;
  @ApiProperty({ type: MetricResultDto }) allocationAt: MetricResultDto;
  @ApiProperty({ type: MetricResultDto })
  sincePreviousAllocation: MetricResultDto;
  @ApiProperty({
    type: Object,
    description:
      'Validation against exact patch/champion catalog slot and maxrank only; no assertion about unlock levels or efficacy',
  })
  validation: object;
  @ApiProperty({
    type: Object,
    description:
      'Last snapshot <= timestamp within60s, with frame/time/offset. No future frame',
  })
  levelContext: object;
}
export class ItemTimingDto {
  @ApiProperty() itemId: number;
  @ApiProperty({ type: MetricResultDto })
  firstEffectiveObservedAt: MetricResultDto;
  @ApiProperty({ type: Number, nullable: true }) effectivePurchaseCount:
    | number
    | null;
  @ApiProperty({ type: Object, nullable: true }) metadata: object | null;
}
export class ItemTrajectoryDto {
  @ApiProperty({
    type: [Object],
    description:
      'Descriptive comparison with authoritative final slots; roleBoundItem excluded when slot scope is ambiguous; never overwrites trajectory',
  })
  finalInventoryReconciliation: object[];
  @ApiProperty({
    type: [Object],
    description:
      'All observed acquisitions; effective=false when supported undo cancels it; null when ambiguous',
  })
  acquisitions: object[];
  @ApiProperty({
    type: [Object],
    description:
      'Ordered timestamp groups, preserved eventIds, reversedEventIds, interpretation/reason and observed multiset after each group',
  })
  transitions: object[];
  @ApiProperty({
    type: [Object],
    description:
      'Item IDs and nullable quantities; separate from authoritative final slots',
  })
  observedInventory: object[];
  @ApiProperty({ type: [Object] }) issues: object[];
  @ApiProperty() stateComplete: boolean;
  @ApiProperty() inventorySemantics: string;
  @ApiProperty({ type: [ItemTimingDto] }) itemTimings: ItemTimingDto[];
  @ApiProperty({ type: Object }) window: object;
}
@ApiExtraModels(MetricResultDto)
export class MatchProgressionDto {
  @ApiProperty() matchId: string;
  @ApiProperty() puuid: string;
  @ApiProperty() championId: number;
  @ApiProperty() gameVersion: string;
  @ApiProperty() queueId: number;
  @ApiProperty() mapId: number;
  @ApiProperty() metricVersion: number;
  @ApiProperty({ type: Number, nullable: true }) processingVersion:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  processedAt: string | null;
  @ApiProperty() source: string;
  @ApiProperty({
    type: Object,
    description:
      'Authoritative finalInventory projection: seven slots, roleBoundItem and coverage; never reconstructed from purchases',
  })
  finalInventory: object;
  @ApiProperty({ type: Object }) catalogs: object;
  @ApiProperty({ type: Object }) quality: object;
  @ApiProperty({ type: [ProgressionEventDto] })
  originalItemEvents: ProgressionEventDto[];
  @ApiProperty({ type: [ProgressionEventDto] })
  originalSkillEvents: ProgressionEventDto[];
  @ApiProperty({ type: [ProgressionEventDto] })
  unattributedEvents: ProgressionEventDto[];
  @ApiProperty({ type: ItemTrajectoryDto, nullable: true })
  trajectory: ItemTrajectoryDto | null;
  @ApiProperty({ type: [SkillAllocationDto], nullable: true }) skillSequence:
    | SkillAllocationDto[]
    | null;
  @ApiProperty() interpretation: string;
}
