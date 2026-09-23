#!/usr/bin/env python3
"""Read-only MatchRaw availability in the dedicated local integration database.

Fixed Docker container/database; does not read DATABASE_URL or connect to prod.
Writes only an evidence JSON file passed by the caller, otherwise stdout.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

QUERY = '''SELECT json_build_object(
 'rows', count(*),
 'summaryAvailable', count(summary),
 'timelineAvailable', count(timeline),
 'bothAvailable', count(*) FILTER (WHERE summary IS NOT NULL AND timeline IS NOT NULL),
 'summaryBytes', coalesce(sum(octet_length(summary)),0),
 'timelineBytes', coalesce(sum(octet_length(timeline)),0),
 'matchIds', coalesce(json_agg("matchId" ORDER BY "matchId"), '[]'::json)
) FROM match_raw;'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    command = ['docker', 'exec', 'high-br-reliability-postgres', 'psql', '-U', 'integration',
               '-d', 'high_br_integration', '-At', '-c', QUERY]
    completed = subprocess.run(command, text=True, capture_output=True, timeout=30, check=True)
    result = {'status': 'measured', 'measuredAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'local isolated integration database',
              'database': 'high_br_integration', 'container': 'high-br-reliability-postgres',
              'query': QUERY, **json.loads(completed.stdout),
              'dataOrigin': 'Integration test residue. Fixture copies use synthetic match IDs; not independent real games.',
              'source': 'test/integration/processing.integration-spec.ts: fixture() and concurrent eight-match test',
              'limitation': 'Compressed payload byte counts establish presence only, not decompression validity or production volume. Database state changes after integration tests.'}
    encoded = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.output:
        args.output.write_text(encoded)
    else:
        print(encoded, end='')


if __name__ == '__main__':
    main()
