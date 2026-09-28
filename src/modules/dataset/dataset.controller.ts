import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DATASET_DEFINITIONS,
  DATASET_HORIZONS,
  DATASET_VERSION,
} from './contracts/definition';
import { normalizeDatasetFilters } from './contracts/query';
import {
  DatasetQueryDto,
  DatasetResponseDto,
  DatasetDefinitionsDto,
} from './dataset.dto';
import { DatasetService } from './application/dataset.service';
@ApiTags('Historical dataset')
@Controller('api/v1/dataset')
export class DatasetController {
  constructor(private readonly dataset: DatasetService) {}
  @Get('definitions')
  @ApiOkResponse({ type: DatasetDefinitionsDto })
  @ApiOperation({ summary: 'Versioned dataset allowlist and temporal rules' })
  definitions() {
    return {
      datasetVersion: DATASET_VERSION,
      horizonsMs: DATASET_HORIZONS,
      definitions: DATASET_DEFINITIONS,
    };
  }
  @Get()
  @ApiOperation({
    summary:
      'Persisted historical contributions; common cohort filters and distinct population counts. No raw parsing or Riot calls.',
  })
  @ApiOkResponse({ type: DatasetResponseDto })
  query(@Query() query: DatasetQueryDto) {
    const { limit: rawLimit, after, ...raw } = query;
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new BadRequestException('limit must be 1..500');
    if (
      after !== undefined &&
      (typeof after !== 'string' || !/^[a-f0-9]{64}$/.test(after))
    )
      throw new BadRequestException('after must be a dataset row ID');
    try {
      return this.dataset.query(normalizeDatasetFilters(raw), limit, after);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
