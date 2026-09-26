const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function perMinute(
  value: unknown,
  durationSeconds: number,
): number | null {
  return finite(value) && finite(durationSeconds) && durationSeconds > 0
    ? value / (durationSeconds / 60)
    : null;
}
