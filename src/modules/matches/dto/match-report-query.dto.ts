import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class MatchReportQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
  @ApiPropertyOptional({ minimum: 0, maximum: 50000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  offset = 0;
  @ApiPropertyOptional({ minimum: 0, maximum: 20, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  evidenceLimit = 3;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 86400000,
    description:
      'Inclusive output timestamp filter; does not change metric denominators',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400000)
  fromMs?: number;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 86400000,
    description: 'Exclusive output timestamp filter',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400000)
  toMs?: number;
  @ApiPropertyOptional({ enum: ['pastOnly', 'nearest'], default: 'pastOnly' })
  @IsOptional()
  @IsIn(['pastOnly', 'nearest'])
  mode: 'pastOnly' | 'nearest' = 'pastOnly';
  @ApiPropertyOptional({
    description: 'Allowlisted section for requested family',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;
  @ApiPropertyOptional({
    description:
      'Relative navigation path supplied in links; own-properties only, <=16segments',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(
    /^(?:[A-Za-z_][A-Za-z0-9_]*|0|[1-9]\d*)(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|0|[1-9]\d*))*$/,
  )
  path?: string;
  @ApiPropertyOptional({ enum: ['death', 'kill', 'objective'] })
  @IsOptional()
  @IsIn(['death', 'kill', 'objective'])
  kind?: 'death' | 'kill' | 'objective';
}
