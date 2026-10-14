import type {
  ReviewCombatWindow,
  ReviewValue,
} from '../../contracts/match-review';
import type {
  DeathResourceEpisode,
  DeathResourceMetric,
} from '../../pure/review/death-resource-review';

export interface ReviewCompactValue {
  value: number | null;
  unit: string;
  origin: ReviewValue['origin'];
  reason: string | null;
  evidenceCount: number;
}
export interface DeathResourceMetricSummary {
  focalPostGain: ReviewCompactValue;
  opponentPostGain: ReviewCompactValue;
  beforeLead: ReviewCompactValue;
  afterLead: ReviewCompactValue;
  priorRelativeGain: ReviewCompactValue;
  postRelativeGain: ReviewCompactValue;
}
export interface DeathCombatSummary {
  kills: number;
  deaths: number;
  recordedAssists: number;
  assists: number | null;
  reason: string | null;
  unknownAssistEventsN: number;
}
export interface DeathResourceSummary {
  eventId: string;
  deathMs: number;
  eligible: boolean;
  reason: string | null;
  priorDeath: boolean | null;
  repeatedDeath: boolean | null;
  tags: string[];
  window: {
    baselineMs: number | null;
    beforeMs: number | null;
    afterMs: number | null;
  };
  metrics: {
    gold: DeathResourceMetricSummary;
    cs: DeathResourceMetricSummary;
    xp: DeathResourceMetricSummary;
  } | null;
  combat: {
    focal: DeathCombatSummary;
    opponent: DeathCombatSummary;
  } | null;
  href: string;
  recapAvailable: boolean;
}

function compact(value: ReviewValue): ReviewCompactValue {
  return {
    value: value.value,
    unit: value.unit,
    origin: value.origin,
    reason: value.reason,
    evidenceCount: value.evidence.length,
  };
}
function resource(metric: DeathResourceMetric): DeathResourceMetricSummary {
  return {
    focalPostGain: compact(metric.focalPostGain),
    opponentPostGain: compact(metric.opponentPostGain),
    beforeLead: compact(metric.beforeLead),
    afterLead: compact(metric.afterLead),
    priorRelativeGain: compact(metric.priorRelativeGain),
    postRelativeGain: compact(metric.postRelativeGain),
  };
}
function combat(window: ReviewCombatWindow): DeathCombatSummary {
  return {
    kills: window.kills,
    deaths: window.deaths,
    recordedAssists: window.recordedAssists,
    assists: window.assists,
    reason: window.reason,
    unknownAssistEventsN: window.unknownAssistEventIds.length,
  };
}

/** Presentation only: full observations, evidence and event identities remain at href. */
export function presentDeathResourceSummary(
  episode: DeathResourceEpisode,
  href: string,
  recapAvailable: boolean,
): DeathResourceSummary {
  return {
    eventId: episode.eventId,
    deathMs: episode.deathMs,
    eligible: episode.eligible,
    reason: episode.reason,
    priorDeath: episode.priorDeath,
    repeatedDeath: episode.repeatedDeath,
    tags: [...episode.tags],
    window: {
      baselineMs: episode.baseline?.actualMs ?? null,
      beforeMs: episode.before?.actualMs ?? null,
      afterMs: episode.after?.actualMs ?? null,
    },
    metrics: episode.metrics
      ? {
          gold: resource(episode.metrics.gold),
          cs: resource(episode.metrics.cs),
          xp: resource(episode.metrics.xp),
        }
      : null,
    combat: episode.combat
      ? {
          focal: combat(episode.combat.afterDeath),
          opponent: combat(episode.combat.opponentAfterDeath),
        }
      : null,
    href,
    recapAvailable,
  };
}
