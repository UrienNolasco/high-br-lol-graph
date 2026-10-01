import type { DatasetQueryRow } from '../../dataset/contracts/query';

const signature = (r: DatasetQueryRow) =>
  [r.definitionVersion, r.datasetVersion, r.processingVersion, r.unit].join(
    ':',
  );
const distribution = (rows: DatasetQueryRow[]) => {
  const incompatible = new Set(rows.map(signature)).size > 1;
  const values = rows
    .filter((r) => r.value !== null && Number.isFinite(r.value))
    .map((r) => r.value!)
    .sort((a, b) => a - b);
  if (incompatible)
    return {
      n: 0,
      observedValidN: values.length,
      missing: rows.length - values.length,
      mean: null,
      p25: null,
      median: null,
      p75: null,
      reason: 'incompatible_versions_or_units',
    };
  const quantile = (p: number) => {
    if (!values.length) return null;
    const i = (values.length - 1) * p,
      low = Math.floor(i);
    return values[low] + (values[Math.ceil(i)] - values[low]) * (i - low);
  };
  return {
    n: values.length,
    observedValidN: values.length,
    missing: rows.length - values.length,
    mean: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    reason: values.length < 30 ? 'insufficient_sample' : null,
  };
};
/** H09: retrospective comparisons in a bounded imported observation cohort. */
export function patchComparison(
  input: DatasetQueryRow[],
  beforePatch: string,
  afterPatch: string,
  truncated: boolean,
) {
  const groups = new Map<string, DatasetQueryRow[]>();
  for (const r of input) {
    const key = JSON.stringify([
      r.matchId,
      r.subjectId,
      r.definitionId,
      r.horizonKey,
    ]);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  const rows: DatasetQueryRow[] = [];
  const unavailableObservations: Array<{
    identity: string;
    value: null;
    reason: string;
    rows: number;
    signatures: string[];
  }> = [];
  for (const [identity, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const observations = new Set(
      group.map((r) =>
        JSON.stringify([
          signature(r),
          r.value,
          r.eligible,
          r.patch,
          r.championId,
          r.role,
          r.gameCreation,
          r.reason,
        ]),
      ),
    );
    if (observations.size > 1) {
      unavailableObservations.push({
        identity,
        value: null,
        reason: 'conflicting_duplicate_identity',
        rows: group.length,
        signatures: [...new Set(group.map(signature))].sort(),
      });
      continue;
    }
    const r = group[0];
    if (r.eligible && r.patch) rows.push(r);
  }
  const patches = [...new Set(rows.map((r) => r.patch!))]
    .map((patch) => {
      const dates = rows
        .filter((r) => r.patch === patch)
        .map((r) => Number(r.gameCreation))
        .filter(Number.isFinite);
      return {
        patch,
        firstObservedMs: dates.length ? Math.min(...dates) : null,
        lastObservedMs: dates.length ? Math.max(...dates) : null,
      };
    })
    .sort(
      (a, b) =>
        (a.firstObservedMs ?? Infinity) - (b.firstObservedMs ?? Infinity) ||
        a.patch.localeCompare(b.patch),
    );
  const period = (patch: string) => {
    const selected = rows.filter((r) => r.patch === patch);
    const matchIds = [...new Set(selected.map((r) => r.matchId))].sort();
    const cells = [
      ...new Set(
        selected.map(
          (r) => `${r.championId ?? 'unknown'}:${r.role ?? 'unknown'}`,
        ),
      ),
    ]
      .sort()
      .map((key) => {
        const cell = selected.filter(
          (r) => `${r.championId ?? 'unknown'}:${r.role ?? 'unknown'}` === key,
        );
        const matches = new Set(cell.map((r) => r.matchId)).size;
        return {
          championId: cell[0].championId,
          role: cell[0].role,
          participantObservations: cell.length,
          distinctMatches: matches,
          pickRate: matchIds.length ? matches / matchIds.length : null,
          denominatorMatches: matchIds.length,
          distribution: distribution(cell),
          signatures: [...new Set(cell.map(signature))].sort(),
        };
      });
    return {
      patch,
      ...patches.find((p) => p.patch === patch),
      matches: matchIds.length,
      participants: selected.length,
      players: new Set(selected.map((r) => r.subjectId)).size,
      matchIds,
      cells,
      missingReasons: selected
        .filter((r) => r.value === null)
        .reduce<Record<string, number>>((a, r) => {
          const key = r.reason ?? 'unknown';
          a[key] = (a[key] ?? 0) + 1;
          return a;
        }, {}),
    };
  };
  const before = period(beforePatch),
    after = period(afterPatch);
  const changes = [
    ...new Set(
      [...before.cells, ...after.cells].map((c) => `${c.championId}:${c.role}`),
    ),
  ]
    .sort()
    .map((key) => {
      const b = before.cells.find((c) => `${c.championId}:${c.role}` === key),
        a = after.cells.find((c) => `${c.championId}:${c.role}` === key);
      const compatible =
        !!b &&
        !!a &&
        b.signatures.length === 1 &&
        a.signatures.length === 1 &&
        b.signatures[0] === a.signatures[0];
      const reason =
        !b || !a
          ? 'missing_period_cell'
          : !compatible
            ? 'incompatible_versions_or_units'
            : b.distribution.mean === null || a.distribution.mean === null
              ? 'no_valid_values'
              : null;
      return {
        championId: (a ?? b)!.championId,
        role: (a ?? b)!.role,
        meanDelta: reason
          ? null
          : a!.distribution.mean! - b!.distribution.mean!,
        pickRateDelta: b && a ? a.pickRate! - b.pickRate! : null,
        reason,
        beforeN: b?.distribution.n ?? 0,
        afterN: a?.distribution.n ?? 0,
        precision:
          (b?.distribution.n ?? 0) < 30 || (a?.distribution.n ?? 0) < 30
            ? 'insufficient_sample'
            : 'no_independent_delta_interval',
      };
    });
  const bi = patches.findIndex((p) => p.patch === beforePatch),
    ai = patches.findIndex((p) => p.patch === afterPatch);
  return {
    version: 1,
    metricId: 'H09',
    sequence: {
      source: 'first_observed_gameCreation_in_returned_cohort',
      patches,
      adjacentObserved: bi >= 0 && ai === bi + 1,
      chronologyAmbiguous:
        bi < 0 ||
        ai < 0 ||
        patches[bi].lastObservedMs === null ||
        patches[ai].firstObservedMs === null ||
        patches[bi].lastObservedMs! >= patches[ai].firstObservedMs!,
      complete: !truncated && unavailableObservations.length === 0,
    },
    before,
    after,
    changes,
    coverage: {
      returnedRows: input.length,
      distinctEligibleRows: rows.length,
      unavailableObservations,
      exclusionReasons: {
        conflicting_duplicate_identity: unavailableObservations.length,
      },
      truncated,
    },
    limitations: [
      'Imported observations only; absent patches are not inferred from public numbering or gameVersion.',
      'Popularity denominator is distinct matches represented by the selected metric/horizon, not all games played or population popularity.',
      'ALL roles are stratified; no pooled metric delta. Choice and player composition vary between periods.',
      'Quantiles use linear interpolation; repeated players and opponents are correlated. N >= 30 does not guarantee precision.',
      'Deltas are descriptive associations, never causal balance effects. No independent confidence interval for deltas.',
      'Missing fields remain unavailable; incompatible definition/dataset/processing versions or units suppress metric deltas.',
    ],
  };
}
