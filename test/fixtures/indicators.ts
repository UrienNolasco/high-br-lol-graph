import { contributionFixture } from './contribution';
import { IndicatorInput } from '../../src/modules/indicators/pure/indicator.types';
export function indicatorFixture(championName = 'Fiora'): IndicatorInput {
  const fixture = contributionFixture();
  const participant = fixture.match.participants.find(
    (p) => p.championName === championName,
  )!;
  return {
    match: fixture.match,
    participant,
    processing: { ...fixture.processing, processingVersion: 4 },
  };
}
