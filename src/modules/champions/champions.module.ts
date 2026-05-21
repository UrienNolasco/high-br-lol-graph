import { Module } from '@nestjs/common';
import { ChampionsController } from './champions.controller';
import { ChampionListService } from './services/champion-list.service';
import { CurrentPatchService } from './services/current-patch.service';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';

@Module({
  imports: [DataDragonModule],
  controllers: [ChampionsController],
  providers: [ChampionListService, CurrentPatchService],
})
export class ChampionsModule {}
