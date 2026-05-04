import { Module } from '@nestjs/common';
import { ChampionsController } from './champions.controller';
import { ChampionsService } from './champions.service';
import { DataDragonModule } from '../../core/data-dragon/data-dragon.module';

@Module({
  imports: [DataDragonModule],
  controllers: [ChampionsController],
  providers: [ChampionsService],
  exports: [ChampionsService],
})
export class ChampionsModule {}
