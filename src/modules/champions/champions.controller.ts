import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChampionsService } from './champions.service';
import { ChampionListDto } from './dto/champion-list.dto';
import { CurrentPatchDto } from './dto/current-patch.dto';

@ApiTags('Champions')
@Controller('api/v1/champions')
export class ChampionsController {
  constructor(private readonly championsService: ChampionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all available champions' })
  @ApiResponse({
    status: 200,
    description: 'Return a list of all champions.',
    type: ChampionListDto,
  })
  getAllChampions(): Promise<ChampionListDto> {
    return this.championsService.getAllChampions();
  }

  @Get('current-patch')
  @ApiOperation({
    summary: 'Get all available League of Legends patch versions',
    description:
      'Returns all available patches ordered from most recent to oldest. The frontend can choose how many to display (e.g., the latest one, the last 3, etc.)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns all available patches with the current (most recent) patch highlighted.',
    type: CurrentPatchDto,
  })
  getCurrentPatch(): Promise<CurrentPatchDto> {
    return this.championsService.getCurrentPatch();
  }
}
