import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';

const source = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
export function contributionFixture() {
  const raw = structuredClone(source);
  const parsed = parseMatchData(raw);
  return {
    raw,
    match: { ...parsed.match, participants: parsed.participants },
    processing: {
      status: 'COMPLETED' as const,
      processingVersion: 2,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
  };
}
