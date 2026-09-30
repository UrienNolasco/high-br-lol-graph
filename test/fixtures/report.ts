import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';
import { normalizeTimelineEvents } from '../../src/modules/matches/adapters/riot/normalized-events';
import { projectTimelineSnapshots } from '../../src/modules/matches/adapters/riot/timeline-snapshots';
import {
  unavailableItemCatalog,
  unavailableSkillCatalog,
} from '../../src/modules/matches/contracts/catalogs';
import { ReportInput } from '../../src/modules/matches/services/report/report.types';
import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
export function reportFixture(): ReportInput {
  const summary = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  ) as MatchDto;
  const timeline = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  ) as TimelineDto;
  const parsed = parseMatchData(summary),
    map = new Map(
      summary.info.participants.map((p) => [p.participantId, p.puuid]),
    );
  const events = normalizeTimelineEvents(
    timeline,
    map,
    new Map(summary.info.participants.map((p) => [p.participantId, p.teamId])),
    { processingVersion: 2 },
  ).map((e) => ({
    ...e,
    processingVersion: 2,
    processedAt: new Date('2026-09-23T00:00:00Z'),
  }));
  return {
    ...parsed.match,
    participants: parsed.participants,
    teams: parsed.teams,
    events,
    timelineProjection: projectTimelineSnapshots(timeline, map),
    processing: {
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
    readLimits: {
      eventLimit: 10000,
      eventRows: events.length,
      eventsTruncated: false,
      frameLimit: 300,
      frameRows: 41,
      framesTruncated: false,
    },
  } as unknown as ReportInput;
}
export const reportCatalogs = {
  getCachedItemCatalog: unavailableItemCatalog,
  getCachedSkillCatalog: unavailableSkillCatalog,
};
