import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LockService } from './lock.service';

@Module({
  imports: [ConfigModule],
  providers: [LockService],
  exports: [LockService],
})
export class LockModule {}
