import { TimelinePointDto } from '../dto/compare-evolve.dto';

export function calculateAverageTimeline(
  matches: { csGraph: number[]; goldGraph: number[] }[],
  field: 'csGraph' | 'goldGraph',
): TimelinePointDto[] {
  if (matches.length === 0) {
    return [];
  }

  const maxMinutes = Math.max(...matches.map((m) => m[field].length));

  const result: TimelinePointDto[] = [];

  for (let minute = 0; minute < maxMinutes; minute++) {
    const values = matches
      .filter((m) => m[field].length > minute)
      .map((m) => m[field][minute]);

    if (values.length > 0) {
      const average = values.reduce((sum, v) => sum + v, 0) / values.length;
      result.push({ minute, value: Math.round(average) });
    }
  }

  return result;
}
