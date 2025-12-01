import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class GetChampionStatsDto {
  @IsString()
  @Matches(/^[0-9]+\.[0-9]+$/, {
    message: 'Patch must be in the format XX.XX (e.g., 12.23)',
  })
  patch: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page? = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit? = 20;

  @IsOptional()
  @IsIn([
    'winRate',
    'gamesPlayed',
    'championName',
    'banRate',
    'kda',
    'dpm',
    'cspm',
    'gpm',
  ])
  sortBy?:
    | 'winRate'
    | 'gamesPlayed'
    | 'championName'
    | 'banRate'
    | 'kda'
    | 'dpm'
    | 'cspm'
    | 'gpm' = 'winRate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
