import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataDragonService } from './data-dragon.service';

@Module({
  imports: [HttpModule],
  providers: [DataDragonService],
  exports: [DataDragonService],
})
export class DataDragonModule {}
