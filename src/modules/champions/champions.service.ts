import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { ChampionListDto, ChampionListItemDto } from './dto/champion-list.dto';
import { CurrentPatchDto } from './dto/current-patch.dto';

@Injectable()
export class ChampionsService {
  constructor(private readonly dataDragon: DataDragonService) {}

  async getAllChampions(): Promise<ChampionListDto> {
    const champions = this.dataDragon.getAllChampions();

    const championList: ChampionListItemDto[] = await Promise.all(
      champions.map(async (champion) => {
        const images = await this.dataDragon.getChampionImageUrls(champion.id);

        return {
          name: champion.name,
          id: champion.id,
          key: parseInt(champion.key, 10),
          title: champion.title,
          version: champion.version,
          images,
        };
      }),
    );

    return {
      champions: championList,
      total: championList.length,
    };
  }

  async getCurrentPatch(): Promise<CurrentPatchDto> {
    const versions = await this.dataDragon.getVersions();

    const patches = versions.map((fullVersion) => {
      const patchParts = fullVersion.split('.');
      let patch: string;
      if (patchParts.length >= 2) {
        patch = `${patchParts[0]}.${patchParts[1]}`;
      } else {
        patch = fullVersion;
      }

      return {
        patch,
        fullVersion,
      };
    });

    return {
      patches,
      current: patches[0],
    };
  }
}
