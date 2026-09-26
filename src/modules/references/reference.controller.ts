import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  normalizeReferenceQuery,
  REFERENCE_DEFINITIONS,
  ReferenceQuery,
} from './reference-contract';
import { ReferenceService } from './reference.service';
import { ReferenceQueryDto, ReferenceResponseDto } from './reference.dto';
import {
  DEFAULT_PRECISION,
  REFERENCE_METHOD_VERSION,
  requiredReferenceUnits,
} from './contracts/statistics';
@ApiTags('Historical references')
@Controller('api/v1/references')
export class ReferenceController {
  constructor(private readonly references: ReferenceService) {}
  @Get('definitions')
  @ApiOperation({
    summary:
      'Participant reference definitions, versioned precision policy and nominal iid assumptions',
  })
  definitions() {
    return {
      methodVersion: REFERENCE_METHOD_VERSION,
      definitions: REFERENCE_DEFINITIONS,
      defaultPrecision: DEFAULT_PRECISION,
      requiredUnits: requiredReferenceUnits(DEFAULT_PRECISION),
      dependencePolicy:
        'Roster-disjoint match selection, target roster excluded; residual iid is an assumption, not established by collection.',
    };
  }
  @Get()
  @ApiOperation({
    summary:
      'Homogeneous champion/role/patch references with explicit sample precision; read-only projections, no live catalogs or Riot calls',
  })
  @ApiOkResponse({ type: ReferenceResponseDto })
  get(@Query() raw: ReferenceQueryDto) {
    let query: ReferenceQuery;
    try {
      query = normalizeReferenceQuery(
        raw as unknown as Record<string, unknown>,
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return this.references.getReference(query);
  }
}
