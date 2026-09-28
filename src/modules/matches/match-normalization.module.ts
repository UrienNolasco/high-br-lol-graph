import { Module } from '@nestjs/common';
import { TimelineParserService } from './adapters/riot/timeline-parser.service';
import { RiotMatchPreparer } from './adapters/riot/match-preparer';
import { MATCH_PREPARER } from './ports/match-preparer';

/** Input normalization is composed independently from the Riot HTTP client. */
@Module({
  providers: [
    TimelineParserService,
    RiotMatchPreparer,
    { provide: MATCH_PREPARER, useExisting: RiotMatchPreparer },
  ],
  exports: [TimelineParserService, MATCH_PREPARER],
})
export class MatchNormalizationModule {}
