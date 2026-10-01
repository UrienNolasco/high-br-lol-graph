import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BuildChoicesService } from './services/build-choices.service';
import {
  BuildChoicesResultDto,
  BuildChoicesQueryDto,
} from './dto/build-choices.dto';
@ApiTags('Contextual build choices')
@Controller('api/v1/analytics')
export class BuildChoicesController {
  constructor(private readonly choices: BuildChoicesService) {}
  @Get('build-choices')
  @ApiOperation({
    summary:
      'Observed items, rune pages and initial summoners by homogeneous checkpoint context',
    description:
      'B03/B05 method1. Exact patch/champion/role and unique matchup, pastOnly resources and effective transactions by t. N, missingness, nonbuyer baselines and nominal uncertainty; selection bias precludes optimal builds or victory guarantees.',
  })
  @ApiQuery({ type: BuildChoicesQueryDto })
  @ApiResponse({ status: 200, type: BuildChoicesResultDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid or unknown filters; exact patch/champion/role required',
  })
  query(@Query() raw: Record<string, unknown>) {
    return this.choices.query(raw);
  }
}
