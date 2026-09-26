export interface ReferenceObservation {
  id: string;
  matchId: string;
  subjectId: string;
  gameCreation: bigint;
  value: number | null;
  roster: string[];
  eligible: boolean;
  reason: string | null;
}

/** Deterministic roster-disjoint selection reduces direct player/match reuse. It does NOT prove residual independence or representativeness. */
export function selectRosterDisjoint<T extends ReferenceObservation>(
  observations: readonly T[],
  excludePlayers: readonly string[] = [],
) {
  const used = new Set(excludePlayers),
    matches = new Set<string>(),
    ids = new Set<string>();
  const signatures = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const row of observations) {
    const signature = JSON.stringify([
      row.matchId,
      row.subjectId,
      row.gameCreation.toString(),
      row.value,
      row.eligible,
      row.reason,
      [...row.roster].sort(),
    ]);
    if (signatures.has(row.id) && signatures.get(row.id) !== signature)
      conflicts.add(row.id);
    signatures.set(row.id, signature);
  }
  const selected: T[] = [],
    excluded: Array<{ id: string; matchId: string; reason: string }> = [];
  for (const row of [...observations].sort((a, b) =>
    a.gameCreation < b.gameCreation
      ? -1
      : a.gameCreation > b.gameCreation
        ? 1
        : a.matchId.localeCompare(b.matchId) || a.id.localeCompare(b.id),
  )) {
    let reason: string | null = null;
    if (conflicts.has(row.id)) reason = 'conflicting_contribution';
    else if (ids.has(row.id)) reason = 'duplicate_contribution';
    else if (!row.eligible) reason = row.reason ?? 'ineligible';
    else if (row.value === null || !Number.isFinite(row.value))
      reason = row.reason ?? 'missing_value';
    else if (
      row.roster.length !== 10 ||
      new Set(row.roster).size !== 10 ||
      !row.roster.includes(row.subjectId)
    )
      reason = 'incomplete_roster';
    else if (matches.has(row.matchId)) reason = 'same_match';
    else if (row.roster.some((p) => used.has(p))) reason = 'overlapping_player';
    ids.add(row.id);
    if (reason) {
      excluded.push({ id: row.id, matchId: row.matchId, reason });
      continue;
    }
    selected.push(row);
    matches.add(row.matchId);
    row.roster.forEach((p) => used.add(p));
  }
  return {
    selected,
    excluded,
    policy:
      'chronological greedy selection, then matchId/id; full ten-player rosters disjoint; selection never sorts by metric value',
    assumptions:
      'Conditional bands assume remaining units are independent and share a distribution. Removing direct roster reuse does not establish this; selection may favor less frequent players and earlier matches.',
  };
}
