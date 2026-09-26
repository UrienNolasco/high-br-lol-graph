/** Stable major/minor patch projection used by external calculations. */
export function extractPatch(gameVersion: string): string {
  const parts = gameVersion.split('.');
  return `${parts[0]}.${parts[1]}`;
}
