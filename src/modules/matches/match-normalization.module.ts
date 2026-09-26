import { Module } from '@nestjs/common';
import { TimelineParserService } from './adapters/riot/timeline-parser.service';

/** Input normalization is composed independently from the Riot HTTP client. */
@Module({
  providers: [TimelineParserService],
  exports: [TimelineParserService],
})
export class MatchNormalizationModule {}
