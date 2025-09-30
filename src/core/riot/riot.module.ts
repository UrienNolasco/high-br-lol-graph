import { Module } from '@nestjs/common';
import { RiotService } from './riot.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [RiotService],
  exports: [RiotService],
})
export class RiotModule {}