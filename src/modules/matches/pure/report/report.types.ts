import type {
  MatchEventProjection,
  MatchParticipant,
  MatchTeam,
} from '@prisma/client';
export type ReportParticipant = Pick<
  MatchParticipant,
  | 'puuid'
  | 'riotIdGameName'
  | 'riotIdTagline'
  | 'championId'
  | 'championName'
  | 'teamId'
  | 'role'
  | 'win'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'kda'
  | 'finalStats'
  | 'finalInventory'
>;
export interface ReportInput {
  matchId: string;
  gameCreation: bigint;
  gameDuration: number;
  gameVersion: string;
  mapId: number;
  queueId: number;
  finalContext: unknown;
  participants: ReportParticipant[];
  teams: Pick<MatchTeam, 'teamId' | 'win' | 'finalObjectives'>[];
  timelineProjection: unknown;
  events: MatchEventProjection[];
  processing: {
    status: string;
    processingVersion: number | null;
    completedAt: Date | null;
  } | null;
  readLimits: {
    eventLimit: number;
    eventRows: number;
    eventsTruncated: boolean;
    frameLimit: number;
    frameRows: number;
    framesTruncated: boolean;
  };
}
export const REPORT_FAMILIES = [
  'contribution',
  'economy',
  'vision',
  'objectives',
  'combat',
  'sequences',
  'progression',
] as const;
export type ReportFamily = (typeof REPORT_FAMILIES)[number];
export const REPORT_SECTIONS: Record<ReportFamily, readonly string[]> = {
  contribution: ['resources', 'combat', 'vision', 'structures'],
  economy: [
    'checkpoints',
    'samples',
    'intervals',
    'phases',
    'unspentGold',
    'finalResources',
  ],
  vision: [
    'metrics',
    'byType',
    'phases',
    'gaps',
    'objectiveWindows',
    'reconciliation',
  ],
  objectives: [
    'chronology',
    'finalTotals',
    'reconciliation',
    'participantContributions',
    'structures',
    'plates',
  ],
  combat: ['participant', 'killerVictimMatrix', 'coParticipation'],
  sequences: [
    'deathEpisodes',
    'deathRates',
    'killEpisodes',
    'killRates',
    'goldChanges',
    'temporalTrades',
    'comeback',
  ],
  progression: [
    'inventory',
    'acquisitions',
    'transitions',
    'itemTimings',
    'skills',
    'reconciliation',
  ],
};
export interface ReportOptions {
  limit: number;
  offset: number;
  evidenceLimit: number;
  fromMs?: number;
  toMs?: number;
  mode: 'pastOnly' | 'nearest';
  section?: string;
  path?: string;
  kind?: 'death' | 'kill' | 'objective';
}
export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  limit: 10,
  offset: 0,
  evidenceLimit: 3,
  mode: 'pastOnly',
};
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export const sourceTime = (input: ReportInput) =>
  input.processing?.completedAt &&
  Number.isFinite(input.processing.completedAt.getTime())
    ? input.processing.completedAt.toISOString()
    : null;
export const sourceKnown = (input: ReportInput) =>
  input.processing?.status === 'COMPLETED' &&
  input.processing.processingVersion !== null &&
  input.processing.processingVersion >= 2 &&
  sourceTime(input) !== null;
