export const CANONICAL_ROLES = [
  'TOP',
  'JUNGLE',
  'MIDDLE',
  'BOTTOM',
  'UTILITY',
] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];
export function normalizeRole(
  role: string | null | undefined,
): CanonicalRole | null {
  const normalized = role?.trim().toUpperCase();
  if (normalized === 'MID') return 'MIDDLE';
  return CANONICAL_ROLES.includes(normalized as CanonicalRole)
    ? (normalized as CanonicalRole)
    : null;
}
export function selectUniqueOpponent<
  T extends { teamId: number; role: string | null },
>(
  participant: T,
  candidates: readonly T[],
): {
  opponent: T | null;
  reason: 'ambiguous_role' | 'missing_opponent' | null;
} {
  const role = normalizeRole(participant.role);
  if (!role || ![100, 200].includes(participant.teamId))
    return { opponent: null, reason: 'ambiguous_role' };
  const opponents = candidates.filter(
    (p) =>
      [100, 200].includes(p.teamId) &&
      p.teamId !== participant.teamId &&
      normalizeRole(p.role) === role,
  );
  return opponents.length === 1
    ? { opponent: opponents[0], reason: null }
    : {
        opponent: null,
        reason: opponents.length ? 'ambiguous_role' : 'missing_opponent',
      };
}

/** Internal patch key only; never an inferred public patch label. */
export function gameVersionPatch(
  gameVersion: string | null | undefined,
): string | null {
  const parts = /^(\d+)\.(\d+)(?:\.|$)/.exec(gameVersion ?? '');
  return parts ? `${Number(parts[1])}.${Number(parts[2])}` : null;
}
export interface RemakeInput {
  gameVersion: string | null;
  durationSeconds: number | null;
  earlySurrenderFlags: readonly (boolean | null | undefined)[];
  surrender: boolean | null;
}
export interface RemakeRule {
  patch: string;
  version: number;
  evidence: string;
  /** A reviewed classifier must return unknown outside its validated domain. */
  classify: (input: RemakeInput) => 'remake' | 'not_remake' | 'unknown';
}
/** Only negative flag semantics are validated locally. No verified positive remake fixture. */
export const REMAKE_RULES: readonly RemakeRule[] = [
  {
    patch: '16.2',
    version: 1,
    evidence:
      'BR1_3200579475: all ten early-surrender flags false; surrender true is distinct. Positive remake classification unvalidated.',
    classify: (input) =>
      input.earlySurrenderFlags.length === 10 &&
      input.earlySurrenderFlags.every((flag) => flag === false)
        ? 'not_remake'
        : 'unknown',
  },
];
export function assessRemake(
  input: RemakeInput,
  rules: readonly RemakeRule[] = REMAKE_RULES,
) {
  const rule = rules.find(
    (r) => r.patch === gameVersionPatch(input.gameVersion),
  );
  if (!rule)
    return {
      status: 'unknown' as const,
      eligible: false,
      reason: 'unsupported_version' as const,
      ruleVersion: null,
      evidence: null,
    };
  const status =
    input.durationSeconds == null ||
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0
      ? 'unknown'
      : rule.classify(input);
  return {
    status,
    eligible: status === 'not_remake',
    reason:
      status === 'unknown'
        ? ('unknown_remake' as const)
        : status === 'remake'
          ? ('remake' as const)
          : null,
    ruleVersion: rule.version,
    evidence: rule.evidence,
  };
}
