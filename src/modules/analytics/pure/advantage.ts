import type { AdvantageCohort } from '../../matches/ports/advantage-reader';
import { normalizeRole } from '../../matches/contracts/eligibility';
import { selectCheckpoint } from '../../matches/contracts/temporal';

export const ADVANTAGE_POLICY = {
  version: 1,
  checkpointsMs: [600000, 900000, 1200000],
  horizonMs: 300000,
  toleranceMs: 60000,
  maxGapMs: 90000,
  neutralGold: 500,
  interpolation: 'piecewise_linear_trapezoids',
  unit: 'gold-minute',
} as const;
const rate = (wins: number, n: number) => {
  if (!n)
    return { n, wins, rate: null, interval95: null, reason: 'no_observations' };
  const p = wins / n,
    z = 1.96,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return {
    n,
    wins,
    rate: p,
    interval95: [c - h, c + h],
    reason: n < 30 ? 'insufficient_sample' : null,
  };
};
const meanEstimate = (values: number[]) => {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const se =
    n > 1
      ? Math.sqrt(
          values.reduce((sum, v) => sum + (v - mean!) ** 2, 0) / (n - 1) / n,
        )
      : null;
  return {
    n,
    mean,
    interval95: se === null ? null : [mean! - 1.96 * se, mean! + 1.96 * se],
    reason: !n ? 'no_observations' : n < 30 ? 'insufficient_sample' : null,
    method: 'nominal_normal_mean_interval',
  };
};
/** Integrate only complete observed spans; no extrapolation across missing snapshots. */
export function advantageIntegral(
  points: { timestamp: number; gold: number | null }[],
) {
  if (
    points.length < 2 ||
    points.some(
      (p) =>
        p.gold === null ||
        !Number.isFinite(p.gold) ||
        !Number.isFinite(p.timestamp) ||
        p.timestamp < 0,
    )
  )
    return null;
  let value = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].timestamp - points[i - 1].timestamp;
    if (dt <= 0 || dt > ADVANTAGE_POLICY.maxGapMs) return null;
    value += (((points[i].gold! + points[i - 1].gold!) / 2) * dt) / 60000;
  }
  return value;
}
export function analyzeAdvantage(
  cohort: AdvantageCohort,
  championId: number,
  role: string,
) {
  const seen = new Set<string>(),
    exclusions: Record<string, number> = {};
  const reject = (r: string) => {
    exclusions[r] = (exclusions[r] ?? 0) + 1;
  };
  const evidence: {
    matchId: string;
    checkpointMs: number;
    timestampMs: number;
    offsetMs: number;
    goldLead: number;
    bin: string;
    win: boolean;
    future: {
      timestampMs: number;
      offsetMs: number;
      goldLead: number;
      leadChange: number;
      focalGoldGain: number;
      opponentGoldGain: number;
      recovered: boolean | null;
      structures: number | null;
    } | null;
    integral: {
      value: number | null;
      startMs: number;
      endMs: number;
      reason: string | null;
    };
  }[] = [];
  for (const m of cohort.matches) {
    if (seen.has(m.matchId)) {
      reject('duplicate_match');
      continue;
    }
    seen.add(m.matchId);
    if (m.populationEligible !== true) {
      reject('population_ineligible_or_unknown');
      continue;
    }
    const focal = m.participants.filter(
      (p) => p.championId === championId && normalizeRole(p.role) === role,
    );
    if (focal.length !== 1) {
      reject('focal_absent_or_ambiguous');
      continue;
    }
    if (
      m.participants.length !== 10 ||
      new Set(m.participants.map((p) => p.puuid)).size !== 10 ||
      [100, 200].some(
        (team) => m.participants.filter((p) => p.teamId === team).length !== 5,
      )
    ) {
      reject('ambiguous_roster');
      continue;
    }
    const p = focal[0],
      opp = m.participants.filter(
        (q) => q.teamId !== p.teamId && normalizeRole(q.role) === role,
      );
    if (
      opp.length !== 1 ||
      m.participants.filter(
        (q) => q.teamId === p.teamId && normalizeRole(q.role) === role,
      ).length !== 1
    ) {
      reject('opponent_or_role_ambiguous');
      continue;
    }
    if (
      m.participants.some(
        (q) => q.win !== (q.teamId === p.teamId ? p.win : !p.win),
      )
    ) {
      reject('inconsistent_outcome');
      continue;
    }
    if (
      m.processing?.status !== 'COMPLETED' ||
      (m.processing.processingVersion ?? 0) < 2
    ) {
      reject('incomplete_or_unsupported_processing');
      continue;
    }
    if (!m.projection || m.projection.projectionVersion !== 1) {
      reject('missing_or_unsupported_projection');
      continue;
    }
    const end = Math.min(
      m.durationMs,
      m.projection.observedEndMs ?? m.durationMs,
    );
    const frames = m.projection.frames
      .filter(
        (f) =>
          f.timestamp !== null &&
          Number.isFinite(f.timestamp) &&
          f.timestamp! >= 0 &&
          f.timestamp! <= end,
      )
      .map((f) => {
        const a = Object.values(f.participantFrames).filter(
            (s) => s.puuid === p.puuid,
          ),
          b = Object.values(f.participantFrames).filter(
            (s) => s.puuid === opp[0].puuid,
          );
        const valid =
          a.length === 1 &&
          b.length === 1 &&
          a[0].totalGold !== null &&
          b[0].totalGold !== null &&
          Number.isFinite(a[0].totalGold) &&
          Number.isFinite(b[0].totalGold) &&
          a[0].totalGold >= 0 &&
          b[0].totalGold >= 0;
        return {
          timestamp: f.timestamp!,
          frameIndex: f.frameIndex,
          focalGold: valid ? a[0].totalGold! : null,
          opponentGold: valid ? b[0].totalGold! : null,
          gold: valid ? a[0].totalGold! - b[0].totalGold! : null,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp || a.frameIndex - b.frameIndex);
    if (new Set(frames.map((f) => f.timestamp)).size !== frames.length) {
      reject('duplicate_timestamp');
      continue;
    }
    for (const target of ADVANTAGE_POLICY.checkpointsMs) {
      const cp = selectCheckpoint(
        frames,
        target,
        end,
        'pastOnly',
        ADVANTAGE_POLICY.toleranceMs,
      );
      if (
        !cp.frame ||
        cp.frame.gold === null ||
        !Number.isFinite(cp.frame.gold)
      ) {
        reject(cp.reason ?? 'missing_gold');
        continue;
      }
      const g = cp.frame.gold,
        bin = g < -500 ? 'deficit' : g > 500 ? 'lead' : 'neutral';
      const later = selectCheckpoint(
        frames,
        target + ADVANTAGE_POLICY.horizonMs,
        end,
        'pastOnly',
        ADVANTAGE_POLICY.toleranceMs,
      );
      const futureValid =
        later.frame &&
        later.frame.gold !== null &&
        Number.isFinite(later.frame.gold);
      const integralPoints = frames.filter(
        (f) =>
          f.timestamp >= cp.timestampMs! &&
          f.timestamp <= (futureValid ? later.timestampMs! : cp.timestampMs!),
      );
      const integral = futureValid ? advantageIntegral(integralPoints) : null;
      const structureEvents = m.structures.filter(
        (e) =>
          e.timestampMs !== null &&
          e.timestampMs > cp.timestampMs! &&
          e.timestampMs <= (later.timestampMs ?? cp.timestampMs!),
      );
      evidence.push({
        matchId: m.matchId,
        checkpointMs: target,
        timestampMs: cp.timestampMs!,
        offsetMs: cp.offsetMs!,
        goldLead: g,
        bin,
        win: p.win,
        future: futureValid
          ? {
              timestampMs: later.timestampMs!,
              offsetMs: later.offsetMs!,
              goldLead: later.frame!.gold!,
              leadChange: later.frame!.gold! - g,
              focalGoldGain: later.frame!.focalGold! - cp.frame.focalGold!,
              opponentGoldGain:
                later.frame!.opponentGold! - cp.frame.opponentGold!,
              recovered: bin === 'deficit' ? later.frame!.gold! >= 0 : null,
              structures:
                m.structures.some(
                  (e) =>
                    e.timestampMs === null ||
                    !Number.isFinite(e.timestampMs) ||
                    e.metricVersion !== 1 ||
                    e.processingVersion !== m.processing!.processingVersion,
                ) ||
                structureEvents.some(
                  (e) => ![100, 200].includes(e.beneficiaryTeamId ?? 0),
                )
                  ? null
                  : new Set(
                      structureEvents
                        .filter((e) => e.beneficiaryTeamId === p.teamId)
                        .map((e) => `${e.frameIndex}:${e.eventIndex}`),
                    ).size,
            }
          : null,
        integral: {
          value: integral,
          startMs: cp.timestampMs!,
          endMs: futureValid ? later.timestampMs! : cp.timestampMs!,
          reason: integral === null ? 'incomplete_or_gapped_window' : null,
        },
      });
    }
  }
  const cells = ADVANTAGE_POLICY.checkpointsMs.flatMap((checkpointMs) =>
    ['deficit', 'neutral', 'lead'].map((bin) => {
      const rows = evidence.filter(
          (e) => e.checkpointMs === checkpointMs && e.bin === bin,
        ),
        future = rows.filter((e) => e.future),
        areas = rows.filter((e) => e.integral.value !== null);
      return {
        checkpointMs,
        bin,
        outcome: rate(rows.filter((e) => e.win).length, rows.length),
        focalGoldGain: meanEstimate(future.map((e) => e.future!.focalGoldGain)),
        opponentGoldGain: meanEstimate(
          future.map((e) => e.future!.opponentGoldGain),
        ),
        leadChange: meanEstimate(future.map((e) => e.future!.leadChange)),
        structures: meanEstimate(
          future
            .filter((e) => e.future!.structures !== null)
            .map((e) => e.future!.structures!),
        ),
        integral: meanEstimate(areas.map((e) => e.integral.value!)),
        futureN: future.length,
        censoredOrMissingFutureN: rows.length - future.length,
        recovery: rate(
          future.filter((e) => e.future!.recovered).length,
          bin === 'deficit' ? future.length : 0,
        ),
        meanLeadChange: future.length
          ? future.reduce((s, e) => s + e.future!.leadChange, 0) / future.length
          : null,
        structuresN: future.filter((e) => e.future!.structures !== null).length,
        meanStructures: future.some((e) => e.future!.structures !== null)
          ? future.reduce((s, e) => s + (e.future!.structures ?? 0), 0) /
            future.filter((e) => e.future!.structures !== null).length
          : null,
        integralN: areas.length,
        meanIntegral: areas.length
          ? areas.reduce((s, e) => s + e.integral.value!, 0) / areas.length
          : null,
      };
    }),
  );
  return {
    policy: ADVANTAGE_POLICY,
    championId,
    role,
    cells,
    evidence,
    coverage: {
      availableMatches: cohort.availableMatches,
      returnedMatches: cohort.matches.length,
      distinctMatches: seen.size,
      truncated: cohort.truncated,
      exclusions,
    },
    limitations: [
      'Observed association; no causal attribution or universal carry classification.',
      'Integral is signed gold-minute, not a win probability.',
      'Nominal Wilson intervals assume independent matches; recurring players and overlapping checkpoints violate independence.',
      'Mean intervals use a nominal normal approximation; small samples cannot establish a trend.',
      'Structures are team resources and cannot be attributed to the focal player.',
      'Past-only checkpoints use actual timestamps; future eligibility is explicit and missing values never become zero.',
    ],
  };
}
