import { Module } from '@nestjs/common';
import { RiotService } from './riot.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get('RIOT_API_BASE_URL'),
        headers: {
          'X-Riot-Token': configService.get('RIOT_API_TOKEN'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RiotService],
  exports: [RiotService],
})
export class RiotModule {}
