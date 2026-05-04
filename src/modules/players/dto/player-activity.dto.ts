import { ApiProperty } from '@nestjs/swagger';

export class HeatmapEntryDto {
  @ApiProperty()
  dayOfWeek: number;

  @ApiProperty()
  hour: number;

  @ApiProperty()
  games: number;

  @ApiProperty()
  wins: number;

  @ApiProperty()
  losses: number;

  @ApiProperty()
  winRate: number;
}

export class ActivityInsightsDto {
  @ApiProperty()
  mostActiveDay: string;

  @ApiProperty()
  mostActiveDayGames: number;

  @ApiProperty()
  mostActiveHour: number;

  @ApiProperty()
  mostActiveHourGames: number;

  @ApiProperty()
  peakWinRate: number;

  @ApiProperty()
  peakWinRateTime: string;

  @ApiProperty()
  worstWinRate: number;

  @ApiProperty()
  worstWinRateTime: string;
}

export class PlayerActivityDto {
  @ApiProperty()
  puuid: string;

  @ApiProperty()
  patch: string;

  @ApiProperty({ type: [HeatmapEntryDto] })
  heatmap: HeatmapEntryDto[];

  @ApiProperty()
  insights: ActivityInsightsDto;
}
