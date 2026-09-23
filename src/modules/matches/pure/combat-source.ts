import { CombatInput, CombatEvent } from './combat-calculator';
export interface CombatSource {
  matchId: string;
  status: string;
  processingVersion: number | null;
  completedAt: Date | null;
}
export function combatInput(
  match: Pick<CombatInput, 'matchId' | 'gameDuration' | 'participants'>,
  events: CombatEvent[],
  source?: CombatSource,
): CombatInput | null {
  if (
    source?.status !== 'COMPLETED' ||
    source.processingVersion == null ||
    source.completedAt == null ||
    !Number.isFinite(source.completedAt.getTime())
  )
    return null;
  return {
    ...match,
    events,
    projectionComplete: source.processingVersion >= 2,
    processingVersion: source.processingVersion,
    processedAt: source.completedAt.toISOString(),
  };
}
