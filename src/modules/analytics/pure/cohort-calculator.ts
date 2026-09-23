import {
  ComparisonTimeline,
  Frame,
  FrameParticipant,
  projectionComparisonTimeline,
} from './comparison-timeline.adapter';
import { selectCheckpoint, selectUniqueOpponent } from '../../../core/metrics';

export interface ComparisonParticipant {
  matchId: string;
  puuid: string;
  role: string;
  teamId: number;
  win: boolean;
  kda: number;
  totalCs: number;
  totalDamage: number;
  goldEarned: number;
  visionScore: number;
  match: {
    gameDuration: number;
    participants: { puuid: string; role: string; teamId: number }[];
  };
}
export const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export function perMinute(
  value: unknown,
  durationSeconds: number,
): number | null {
  return finite(value) && finite(durationSeconds) && durationSeconds > 0
    ? value / (durationSeconds / 60)
    : null;
}
export function observation(values: (number | null)[], totalN = values.length) {
  const valid = values.filter(finite);
  return {
    value: valid.length
      ? valid.reduce((sum, v) => sum + v, 0) / valid.length
      : null,
    validN: valid.length,
    totalN,
    coverage: totalN ? valid.length / totalN : null,
    reason: valid.length ? null : 'no_valid_samples',
  };
}

function participantAt(
  frame: Frame,
  timeline: ComparisonTimeline,
  puuid: string,
) {
  const candidates = timeline.participants.filter((p) => p.puuid === puuid);
  return candidates.length === 1
    ? frame.participantFrames[String(candidates[0].participantId)]
    : undefined;
}
function fieldValue(
  p: FrameParticipant | undefined,
  field: 'cs' | 'gold' | 'xp',
): number | null {
  if (!p) return null;
  if (field === 'cs')
    return finite(p.minionsKilled) && finite(p.jungleMinionsKilled)
      ? p.minionsKilled + p.jungleMinionsKilled
      : null;
  const value = field === 'gold' ? p.totalGold : p.xp;
  return finite(value) ? value : null;
}
export function calculateCohort(
  matches: ComparisonParticipant[],
  timelines: Map<string, ComparisonTimeline>,
) {
  const values = {
    winRate: observation(matches.map((p) => (p.win ? 100 : 0))),
    avgKda: observation(matches.map((p) => (finite(p.kda) ? p.kda : null))),
    avgCspm: observation(
      matches.map((p) => perMinute(p.totalCs, p.match.gameDuration)),
    ),
    avgDpm: observation(
      matches.map((p) => perMinute(p.totalDamage, p.match.gameDuration)),
    ),
    avgGpm: observation(
      matches.map((p) => perMinute(p.goldEarned, p.match.gameDuration)),
    ),
    avgVisionScore: observation(
      matches.map((p) => (finite(p.visionScore) ? p.visionScore : null)),
    ),
  };
  const laneEvidence = matches.map((p) => {
    const timeline =
      timelines.get(p.matchId) ?? projectionComparisonTimeline(null);
    const opponent = selectUniqueOpponent(p, p.match.participants);
    const endMs = timeline.endMs ?? Math.max(0, p.match.gameDuration * 1000);
    const checkpoint = selectCheckpoint(timeline.frames, 900_000, endMs);
    const reason =
      opponent.reason ??
      (endMs < 900_000 ? 'short_match' : timeline.reason) ??
      checkpoint.reason;
    const playerFrame =
      checkpoint.frame && participantAt(checkpoint.frame, timeline, p.puuid);
    const opponentFrame =
      checkpoint.frame &&
      opponent.opponent &&
      participantAt(checkpoint.frame, timeline, opponent.opponent.puuid);
    const diff = (field: 'cs' | 'gold' | 'xp') => {
      const a = fieldValue(playerFrame || undefined, field);
      const b = fieldValue(opponentFrame || undefined, field);
      return !reason && a !== null && b !== null ? a - b : null;
    };
    return {
      matchId: p.matchId,
      opponentPuuid: opponent.opponent?.puuid ?? null,
      timestampMs: checkpoint.timestampMs,
      offsetMs: checkpoint.offsetMs,
      reason:
        reason ??
        (!playerFrame || !opponentFrame ? 'missing_participant_frame' : null),
      cs: diff('cs'),
      gold: diff('gold'),
      xp: diff('xp'),
      fieldReasons: {
        cs: diff('cs') === null ? (reason ?? 'missing_field') : null,
        gold: diff('gold') === null ? (reason ?? 'missing_field') : null,
        xp: diff('xp') === null ? (reason ?? 'missing_field') : null,
      },
    };
  });
  const laneSamples = {
    cs: observation(laneEvidence.map((e) => e.cs)),
    gold: observation(laneEvidence.map((e) => e.gold)),
    xp: observation(laneEvidence.map((e) => e.xp)),
  };
  const graph = (field: 'cs' | 'gold') => {
    const endMs = Math.max(
      0,
      ...matches.map(
        (p) =>
          timelines.get(p.matchId)?.endMs ??
          Math.max(0, p.match.gameDuration * 1000),
      ),
    );
    const points: {
      minute: number;
      value: number | null;
      validN: number;
      totalN: number;
      coverage: number | null;
      reason: string | null;
      evidence: { matchId: string; timestampMs: number; offsetMs: number }[];
    }[] = [];
    for (let minute = 0; minute * 60_000 <= endMs; minute++) {
      const evidence: {
        matchId: string;
        timestampMs: number;
        offsetMs: number;
      }[] = [];
      const samples = matches.map((p) => {
        const timeline = timelines.get(p.matchId);
        if (!timeline || timeline.reason) return null;
        const checkpoint = selectCheckpoint(
          timeline.frames,
          minute * 60_000,
          timeline.endMs ?? Math.max(0, p.match.gameDuration * 1000),
        );
        if (!checkpoint.frame) return null;
        const value = fieldValue(
          participantAt(checkpoint.frame, timeline, p.puuid),
          field,
        );
        if (value !== null)
          evidence.push({
            matchId: p.matchId,
            timestampMs: checkpoint.timestampMs,
            offsetMs: checkpoint.offsetMs,
          });
        return value;
      });
      points.push({ minute, ...observation(samples), evidence });
    }
    return points;
  };
  return {
    stats: {
      gamesPlayed: matches.length,
      winRate: values.winRate.value,
      avgKda: values.avgKda.value,
      avgCspm: values.avgCspm.value,
      avgDpm: values.avgDpm.value,
      avgGpm: values.avgGpm.value,
      avgVisionScore: values.avgVisionScore.value,
      samples: values,
    },
    laningPhase: {
      avgCsd15: laneSamples.cs.value,
      avgGd15: laneSamples.gold.value,
      avgXpd15: laneSamples.xp.value,
      soloKills15: null,
      soloDeaths15: null,
      soloKills15Reason: 'not_calculated',
      soloDeaths15Reason: 'not_calculated',
      checkpoint: { targetMs: 900_000, mode: 'nearest', toleranceMs: 60_000 },
      samples: laneSamples,
      evidence: laneEvidence,
    },
    csGraph: matches.length ? graph('cs') : [],
    goldGraph: matches.length ? graph('gold') : [],
  };
}
