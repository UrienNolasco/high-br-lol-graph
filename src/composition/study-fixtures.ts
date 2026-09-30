import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MatchDto } from '../core/riot/dto/match.dto';
import type { TimelineDto } from '../core/riot/dto/timeline.dto';
import { PROCESSING_VERSION } from '../lib/processing-policy';
import { parseMatchData } from '../modules/matches/adapters/riot/match.parser';
import { normalizeTimelineEvents } from '../modules/matches/adapters/riot/normalized-events';
import { projectTimelineSnapshots } from '../modules/matches/adapters/riot/timeline-snapshots';
import { TimelineParserService } from '../modules/matches/adapters/riot/timeline-parser.service';
import {
  unavailableItemCatalog,
  unavailableSkillCatalog,
} from '../modules/matches/contracts/catalogs';
import type { ReportInput } from '../modules/matches/services/report/report.types';
import type { DatasetInput } from '../modules/dataset/pure/dataset-builder';
import type { IndicatorInput } from '../modules/indicators/pure/indicator.types';

const root = join(__dirname, '../..');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(join(root, file), 'utf8')) as T;

export function contributionFixture() {
  const raw = structuredClone(
    readJson<MatchDto>('exemplo_partida_BR1_3200579475.json'),
  );
  const parsed = parseMatchData(raw);
  return {
    raw,
    match: { ...parsed.match, participants: parsed.participants },
    processing: {
      status: 'COMPLETED' as const,
      processingVersion: 2,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
  };
}

export function indicatorFixture(championName = 'Fiora'): IndicatorInput {
  const fixture = contributionFixture();
  const participant = fixture.match.participants.find(
    (p) => p.championName === championName,
  )!;
  return {
    match: fixture.match,
    participant,
    processing: { ...fixture.processing, processingVersion: 4 },
  };
}

export function reportFixture(): ReportInput {
  const summary = readJson<MatchDto>('exemplo_partida_BR1_3200579475.json');
  const timeline = readJson<TimelineDto>(
    'exemplo_partida_timeline_BR1_3200579475.json',
  );
  const parsed = parseMatchData(summary);
  const map = new Map(
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

export function historicalDatasetFixture(): DatasetInput {
  const summary = readJson<MatchDto>('exemplo_partida_BR1_3200579475.json');
  const timeline = readJson<TimelineDto>(
    'exemplo_partida_timeline_BR1_3200579475.json',
  );
  const participantMap = new Map<number, string>(
    summary.info.participants.map((p) => [p.participantId, p.puuid]),
  );
  const participantTeams = new Map<number, number>(
    summary.info.participants.map((p) => [p.participantId, p.teamId]),
  );
  const parsed = new TimelineParserService().parseTimeline(
    timeline,
    participantMap,
    participantTeams,
    PROCESSING_VERSION,
  );
  return {
    ...parseMatchData(summary),
    projection: parsed.snapshotProjection,
    events: parsed.normalizedEvents,
    processingVersion: PROCESSING_VERSION,
    processedAt: new Date('2026-09-23T00:00:00.000Z'),
    lineage: {
      observationIds: ['synthetic:collector:fixture', 'synthetic:sync:fixture'],
      sources: ['collector', 'player_sync'],
      status: 'observed',
      reason: null,
    },
  };
}

export const referenceQueryFixture = {
  patch: '16.2',
  queueId: 420,
  mapId: 11,
  championId: 103,
  role: 'MIDDLE',
  definitionId: 'snapshot.totalGold',
  horizonKey: 't:900000',
};

export function referenceRowFixture(i: number) {
  return {
    id: i.toString(16).padStart(64, '0'),
    matchId: `MET20_${i}`,
    subjectId: `MET20_${i}:0`,
    gameCreation: BigInt(1000 + i),
    value: i,
    roster: Array.from({ length: 10 }, (_, j) => `MET20_${i}:${j}`),
    eligible: true,
    reason: null,
    processedAt: new Date('2026-09-23T00:00:00Z'),
    lineage: { status: 'unknown', reason: 'synthetic_fixture' },
    origin: 'observed' as const,
    source: { synthetic: true },
    context: {
      patch: '16.2',
      queueId: 420,
      mapId: 11,
      championId: 103,
      role: 'MIDDLE',
      horizonKey: 't:900000',
      definitionVersion: 1,
    },
  };
}
