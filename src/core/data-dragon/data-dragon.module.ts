import { Module } from '@nestjs/common';
import { DataDragonService } from './data-dragon.service';

@Module({
  providers: [DataDragonService],
  exports: [DataDragonService],
})
export class DataDragonModule {}
