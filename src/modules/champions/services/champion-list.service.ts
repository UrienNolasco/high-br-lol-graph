import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { ChampionListDto, ChampionListItemDto } from '../dto/champion-list.dto';

@Injectable()
export class ChampionListService {
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
}
