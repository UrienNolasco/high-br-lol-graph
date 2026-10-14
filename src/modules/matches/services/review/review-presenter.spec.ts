import type {
  ReviewCombatWindow,
  ReviewValue,
} from '../../contracts/match-review';
import type {
  DeathResourceEpisode,
  DeathResourceMetric,
  DeathResourceSnapshot,
} from '../../pure/review/death-resource-review';
import { presentDeathResourceSummary } from './review-presenter';

function cell(
  value: number | null = 0,
  reason: string | null = null,
): ReviewValue {
  return {
    value,
    reason,
    unit: 'gold',
    origin: value === null ? 'unavailable' : 'derived',
    evidence: Array.from({ length: 4 }, (_, i) => ({
      source: 'MatchTimelineProjection.frames',
      field: 'totalGold',
      value: i,
      frameIndex: i,
      timestampMs: i * 60000,
    })),
  };
}
function metric(): DeathResourceMetric {
  return {
    baselineLead: cell(-100),
    beforeLead: cell(-25),
    afterLead: cell(25),
    focalPriorGain: cell(100),
    focalPostGain: cell(150),
    opponentPriorGain: cell(25),
    opponentPostGain: cell(100),
    priorRelativeGain: cell(75),
    postRelativeGain: cell(50),
    priorRelativePerMinute: {
      ...cell(25),
      denominator: { value: 3, unit: 'minutes' },
    },
    postRelativePerMinute: {
      ...cell(50 / 3),
      denominator: { value: 3, unit: 'minutes' },
    },
    relativeRateChange: cell(-25 / 3),
  };
}
function snapshot(ms: number): DeathResourceSnapshot {
  return {
    targetMs: ms + 1000,
    actualMs: ms,
    offsetMs: -1000,
    frameIndex: ms / 60000,
    reason: null,
    focal: {
      gold: cell(),
      cs: cell(),
      xp: cell(),
      laneCs: cell(),
      jungleCs: cell(),
    },
    opponent: {
      gold: cell(),
      cs: cell(),
      xp: cell(),
      laneCs: cell(),
      jungleCs: cell(),
    },
  };
}
function combat(kills = 0): ReviewCombatWindow {
  return {
    startMs: 301000,
    endMs: 480000,
    bounds: '(]',
    kills,
    deaths: 0,
    recordedAssists: 0,
    assists: 0,
    reason: null,
    events: [],
    unknownAssistEventIds: [],
  };
}
function episode(): DeathResourceEpisode {
  return {
    eventId: 'm:6:0',
    deathMs: 301000,
    eligible: true,
    temporalEligible: true,
    reason: null,
    priorDeath: false,
    repeatedDeath: false,
    baseline: snapshot(120000),
    before: snapshot(300000),
    after: snapshot(480000),
    priorMinutes: 3,
    postMinutes: 3,
    metrics: {
      gold: metric(),
      cs: metric(),
      xp: metric(),
      laneCs: metric(),
      jungleCs: metric(),
    },
    combat: {
      prior: combat(7),
      post: combat(8),
      afterDeath: combat(2),
      beforeDeath: combat(6),
      opponentPrior: combat(4),
      opponentPost: combat(5),
      opponentAfterDeath: combat(1),
      opponentBeforeDeath: combat(3),
    },
    tags: ['gold_gap_not_worse'],
  };
}
const href = '/api/v1/matches/m/review/player/deaths/m%3A6%3A0';

describe('death resource list presentation', () => {
  it('keeps exact observations and compact values with a navigable full-evidence detail', () => {
    const source = episode(),
      result = presentDeathResourceSummary(source, href, true);
    expect(result).toMatchObject({
      eventId: 'm:6:0',
      deathMs: 301000,
      eligible: true,
      reason: null,
      priorDeath: false,
      repeatedDeath: false,
      window: { baselineMs: 120000, beforeMs: 300000, afterMs: 480000 },
      href,
      recapAvailable: true,
    });
    expect(result.metrics?.gold).toEqual({
      focalPostGain: {
        value: 150,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
      opponentPostGain: {
        value: 100,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
      beforeLead: {
        value: -25,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
      afterLead: {
        value: 25,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
      priorRelativeGain: {
        value: 75,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
      postRelativeGain: {
        value: 50,
        unit: 'gold',
        origin: 'derived',
        reason: null,
        evidenceCount: 4,
      },
    });
    expect(Object.keys(result.metrics!)).toEqual(['gold', 'cs', 'xp']);
    expect(JSON.stringify(result)).not.toContain('"evidence":');
    expect(JSON.stringify(result)).not.toContain('participantFrames');
  });
  it('uses strictly-after-death combat instead of the snapshot window or previous period', () => {
    const source = episode();
    source.combat!.afterDeath.assists = null;
    source.combat!.afterDeath.reason = 'unknown_assistance';
    source.combat!.afterDeath.unknownAssistEventIds = ['m:7:1', 'm:8:2'];
    const result = presentDeathResourceSummary(source, href, false);
    expect(result.combat?.focal).toEqual({
      kills: 2,
      deaths: 0,
      recordedAssists: 0,
      assists: null,
      reason: 'unknown_assistance',
      unknownAssistEventsN: 2,
    });
    expect(result.combat?.opponent.kills).toBe(1);
    expect(JSON.stringify(result)).not.toContain('m:7:1');
    expect(result.recapAvailable).toBe(false);
  });
  it('preserves missing values, literal zeros and their availability reasons', () => {
    const source = episode();
    source.metrics!.xp.focalPostGain = cell(null, 'missing_field');
    source.metrics!.cs.postRelativeGain = cell(0);
    const result = presentDeathResourceSummary(source, href, true);
    expect(result.metrics?.xp.focalPostGain).toMatchObject({
      value: null,
      origin: 'unavailable',
      reason: 'missing_field',
      evidenceCount: 4,
    });
    expect(result.metrics?.cs.postRelativeGain).toMatchObject({
      value: 0,
      reason: null,
    });
  });
  it('retains censored episodes and unknown context without inventing zero metrics', () => {
    const source: DeathResourceEpisode = {
      ...episode(),
      eligible: false,
      temporalEligible: false,
      reason: 'censored_followup',
      baseline: null,
      before: null,
      after: null,
      priorDeath: null,
      repeatedDeath: null,
      metrics: null,
      combat: null,
      tags: [],
    };
    expect(presentDeathResourceSummary(source, href, false)).toMatchObject({
      eligible: false,
      reason: 'censored_followup',
      window: { baselineMs: null, beforeMs: null, afterMs: null },
      metrics: null,
      combat: null,
      priorDeath: null,
      repeatedDeath: null,
      href,
    });
  });
  it('does not hide known resource observations when a repeated death makes the episode ineligible', () => {
    const source = episode();
    source.eligible = false;
    source.reason = 'repeated_death';
    source.repeatedDeath = true;
    source.tags = [];
    const result = presentDeathResourceSummary(source, href, true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('repeated_death');
    expect(result.metrics?.gold.postRelativeGain.value).toBe(50);
  });
  it('never mutates the full episode or shares mutable evidence/tags with the summary', () => {
    const source = episode(),
      unchanged = structuredClone(source),
      result = presentDeathResourceSummary(source, href, true);
    result.tags.push('changed_in_consumer');
    result.metrics!.gold.focalPostGain.value = 999;
    result.combat!.focal.kills = 999;
    result.window.beforeMs = 0;
    expect(source).toEqual(unchanged);
    expect(source.metrics!.gold.focalPostGain.evidence).toHaveLength(4);
  });
});
