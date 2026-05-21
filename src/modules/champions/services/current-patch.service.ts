import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { parsePatches } from '../pure/patch.parser';
import { CurrentPatchDto } from '../dto/current-patch.dto';

@Injectable()
export class CurrentPatchService {
  constructor(private readonly dataDragon: DataDragonService) {}

  async getCurrentPatch(): Promise<CurrentPatchDto> {
    const versions = await this.dataDragon.getVersions();
    const patches = parsePatches(versions);

    return {
      patches,
      current: patches[0],
    };
  }
}
