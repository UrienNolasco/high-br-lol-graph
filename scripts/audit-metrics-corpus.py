#!/usr/bin/env python3
"""Reproducible offline Match-V5 corpus audit. No network or database writes.

The two sides of each reconciliation come from independent summary/timeline
payloads. Synthetic variants test failure handling, never increase real N.
"""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KNOWN_WARDS = {'YELLOW_TRINKET', 'BLUE_TRINKET', 'SIGHT_WARD', 'CONTROL_WARD'}
KNOWN_EVENTS = {'ASCENDED_EVENT', 'BUILDING_KILL', 'CHAMPION_KILL', 'CHAMPION_SPECIAL_KILL',
                'CHAMPION_TRANSFORM', 'DRAGON_SOUL_GIVEN', 'ELITE_MONSTER_KILL', 'GAME_END',
                'ITEM_DESTROYED', 'ITEM_PURCHASED', 'ITEM_SOLD', 'ITEM_UNDO', 'LEVEL_UP',
                'OBJECTIVE_BOUNTY_FINISH', 'OBJECTIVE_BOUNTY_PRESTART', 'PAUSE_END',
                'SKILL_LEVEL_UP', 'TURRET_PLATE_DESTROYED', 'WARD_KILL', 'WARD_PLACED'}
OBJECTIVES = {'DRAGON': 'dragon', 'BARON_NASHOR': 'baron', 'HORDE': 'horde',
              'RIFTHERALD': 'riftHerald', 'TOWER_BUILDING': 'tower', 'INHIBITOR_BUILDING': 'inhibitor'}
OPTIONAL_FIELDS = ['wardsPlaced', 'wardsKilled', 'detectorWardsPlaced', 'visionWardsBoughtInGame',
                   'totalHealsOnTeammates', 'totalDamageShieldedOnTeammates', 'timePlayed',
                   'gameEndedInSurrender', 'gameEndedInEarlySurrender', 'roleBoundItem',
                   'challenges.soloKills']


def field(obj, path):
    for part in path.split('.'):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def plus(a, b):
    return a + b if isinstance(a, (int, float)) and isinstance(b, (int, float)) else None


def role(value):
    return 'MIDDLE' if value == 'MID' else value if value in {'TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'} else None


def check(identity, metric, expected, observed):
    return {'subject': identity, 'metric': metric, 'expectedSummary': expected,
            'observedTimeline': observed,
            'status': 'unavailable' if expected is None or observed is None else 'pass' if expected == observed else 'fail'}


def audit(match, timeline):
    participants = match.get('info', {}).get('participants', [])
    frames = timeline.get('info', {}).get('frames', [])
    events = [dict(e, sourceFrameIndex=fi, sourceEventIndex=ei)
              for fi, frame in enumerate(frames) for ei, e in enumerate(frame.get('events', []))]
    kills = [e for e in events if e.get('type') == 'CHAMPION_KILL']
    wards = [e for e in events if e.get('type') == 'WARD_PLACED' and e.get('wardType') in KNOWN_WARDS]
    clears = [e for e in events if e.get('type') == 'WARD_KILL']
    valid_frames = [(i, f) for i, f in enumerate(frames) if isinstance(f.get('timestamp'), (int, float))]
    final = max(valid_frames, key=lambda pair: (pair[1]['timestamp'], pair[0]))[1] if valid_frames else {}
    player_checks = []
    for p in participants:
        pid = p.get('participantId')
        last = final.get('participantFrames', {}).get(str(pid), {})
        observed = {
            'kills': sum(e.get('killerId') == pid for e in kills),
            'deaths': sum(e.get('victimId') == pid for e in kills),
            'assists': sum(pid in e.get('assistingParticipantIds', []) for e in kills),
            'wardsPlaced': sum(e.get('creatorId') == pid for e in wards),
            'wardsKilled': sum(e.get('killerId') == pid for e in clears),
            'controlWards': sum(e.get('creatorId') == pid and e.get('wardType') == 'CONTROL_WARD' for e in wards),
            'soloKills': sum(e.get('killerId') == pid and not e.get('assistingParticipantIds') for e in kills),
            'finalGold': last.get('totalGold'),
            'finalCS': plus(last.get('minionsKilled'), last.get('jungleMinionsKilled')),
            'finalDamage': field(last, 'damageStats.totalDamageDoneToChampions'),
        }
        expected = {key: p.get(key) for key in ('kills', 'deaths', 'assists', 'wardsPlaced', 'wardsKilled')}
        expected.update(controlWards=p.get('detectorWardsPlaced'), soloKills=field(p, 'challenges.soloKills'),
                        finalGold=p.get('goldEarned'), finalCS=plus(p.get('totalMinionsKilled'), p.get('neutralMinionsKilled')),
                        finalDamage=p.get('totalDamageDealtToChampions'))
        for metric in observed:
            player_checks.append(check(pid, metric, expected[metric], observed[metric] if frames else None))
    objectives = Counter()
    unknown_objective_teams = []
    for e in events:
        if e.get('type') not in {'ELITE_MONSTER_KILL', 'BUILDING_KILL'}:
            continue
        building = e['type'] == 'BUILDING_KILL'
        team = 300 - e['teamId'] if building and e.get('teamId') in (100, 200) else e.get('killerTeamId') if not building else None
        if team not in (100, 200):
            unknown_objective_teams.append([e['sourceFrameIndex'], e['sourceEventIndex']])
            continue
        objectives[(team, e.get('buildingType') if building else e.get('monsterType'))] += 1
    objective_checks = [check(team['teamId'], kind, field(team, f'objectives.{summary}.kills'),
                              objectives[(team['teamId'], kind)] if frames else None)
                        for team in match.get('info', {}).get('teams', []) for kind, summary in OBJECTIVES.items()]
    timestamps = [f['timestamp'] for _, f in valid_frames]
    minute_counts = Counter(int(ts // 60000) for ts in timestamps)
    event_types = Counter(e.get('type', 'MISSING_TYPE') for e in events)
    unknown_wards = Counter(e.get('wardType', 'MISSING_TYPE') for e in events if e.get('type') == 'WARD_PLACED' and e.get('wardType') not in KNOWN_WARDS)
    duration_ms = match.get('info', {}).get('gameDuration', 0) * 1000
    end_events = [e['timestamp'] for e in events if e.get('type') == 'GAME_END' and isinstance(e.get('timestamp'), (int, float))]
    end_ms = max(end_events) if end_events else duration_ms
    checkpoints = []
    for target in (300000, 600000, 900000, 1200000):
        for mode in ('nearest', 'pastOnly'):
            choices = [(i, f) for i, f in valid_frames if 0 <= f['timestamp'] <= end_ms and abs(f['timestamp'] - target) <= 60000 and (mode != 'pastOnly' or f['timestamp'] <= target)]
            selected = min(choices, key=lambda pair: (abs(pair[1]['timestamp'] - target), pair[1]['timestamp'], pair[0])) if choices and target <= end_ms else None
            checkpoints.append({'targetMs': target, 'mode': mode, 'toleranceMs': 60000,
                                'frameIndex': selected[0] if selected else None,
                                'timestampMs': selected[1]['timestamp'] if selected else None,
                                'offsetMs': selected[1]['timestamp'] - target if selected else None,
                                'reason': None if selected else 'short_match' if target > end_ms else 'missing_frame'})
    opponents = []
    for p in participants:
        eligible = [q for q in participants if q.get('teamId') in (100, 200) and p.get('teamId') in (100, 200) and q['teamId'] != p['teamId'] and role(p.get('teamPosition')) and role(q.get('teamPosition')) == role(p.get('teamPosition'))]
        opponents.append({'participantId': p.get('participantId'), 'originalRole': p.get('teamPosition'), 'canonicalRole': role(p.get('teamPosition')),
                          'opponentId': eligible[0]['participantId'] if len(eligible) == 1 else None,
                          'reason': None if len(eligible) == 1 else 'ambiguous_role' if len(eligible) > 1 or role(p.get('teamPosition')) is None else 'missing_opponent'})
    all_checks = player_checks + objective_checks
    expected_ids = {p.get('puuid') for p in participants}
    timeline_ids = set(timeline.get('metadata', {}).get('participants', []))
    integrity = []
    if match.get('metadata', {}).get('matchId') != timeline.get('metadata', {}).get('matchId'):
        integrity.append('match_id_mismatch')
    if expected_ids != timeline_ids:
        integrity.append('participant_identity_mismatch')
    if timestamps != sorted(timestamps):
        integrity.append('frame_order_mismatch')
    if len(timestamps) != len(frames):
        integrity.append('missing_frame_timestamp')
    return {
        'matchId': match.get('metadata', {}).get('matchId'),
        'context': {k: match.get('info', {}).get(k) for k in ('gameVersion', 'queueId', 'mapId', 'gameDuration')},
        'playerChecks': player_checks, 'objectiveChecks': objective_checks,
        'summary': {'playerChecks': len(player_checks), 'objectiveChecks': len(objective_checks), **{state: sum(c['status'] == state for c in all_checks) for state in ('pass', 'fail', 'unavailable')}},
        'integrityIssues': integrity,
        'coverage': {'frames': len(frames), 'snapshots': sum(len(f.get('participantFrames', {})) for f in frames),
                     'frameTimestampMs': timestamps, 'duplicateMinutes': {str(k): v for k, v in sorted(minute_counts.items()) if v > 1},
                     'duplicateTimestamps': {str(k): v for k, v in Counter(timestamps).items() if v > 1},
                     'gapsOverToleranceMs': [[a, b] for a, b in zip(sorted(timestamps), sorted(timestamps)[1:]) if b - a > 120000],
                     'optionalFields': {k: {'present': sum(field(p, k) is not None for p in participants), 'total': len(participants)} for k in OPTIONAL_FIELDS},
                     'eventTypes': dict(sorted(event_types.items())), 'unknownEventTypes': {k: v for k, v in sorted(event_types.items()) if k not in KNOWN_EVENTS},
                     'recognizedWardPlacements': len(wards), 'unknownWardTypes': dict(sorted(unknown_wards.items())),
                     'unknownObjectiveTeamEvidence': unknown_objective_teams},
        'checkpoints': checkpoints, 'opponents': opponents,
        'surrender': {'flags': [p.get('gameEndedInSurrender') for p in participants],
                      'earlyFlags': [p.get('gameEndedInEarlySurrender') for p in participants],
                      'caution': 'Surrender is not remake; positive remake rules require separate patch validation.'},
    }


def variations(match, timeline):
    """Each mutation starts from a fresh deep copy; nothing changes fixture files."""
    for name in ('missing_frames', 'duplicate_timestamp', 'unknown_types', 'ambiguous_role',
                 'short_match', 'surrender_false', 'early_surrender', 'missing_optional', 'unsupported_patch'):
        m, t = deepcopy(match), deepcopy(timeline)
        if name == 'missing_frames':
            t['info']['frames'] = [f for f in t['info']['frames'] if not 780000 <= f['timestamp'] <= 1020000]
        elif name == 'duplicate_timestamp':
            duplicate = deepcopy(t['info']['frames'][15]); duplicate['events'] = []
            t['info']['frames'].insert(16, duplicate)
        elif name == 'unknown_types':
            t['info']['frames'][1]['events'].extend([{'type': 'FUTURE_EVENT', 'timestamp': 60000}, {'type': 'WARD_PLACED', 'wardType': 'FUTURE_WARD', 'creatorId': 1, 'timestamp': 60000}])
        elif name == 'ambiguous_role':
            m['info']['participants'][6]['teamPosition'] = 'TOP'
        elif name == 'short_match':
            m['info']['gameDuration'] = 120
            t['info']['frames'] = [f for f in t['info']['frames'] if f['timestamp'] <= 120000]
        elif name in ('surrender_false', 'early_surrender'):
            for p in m['info']['participants']:
                p['gameEndedInSurrender'] = name == 'early_surrender'
                p['gameEndedInEarlySurrender'] = name == 'early_surrender'
        elif name == 'missing_optional':
            p = m['info']['participants'][0]
            for key in OPTIONAL_FIELDS:
                if '.' not in key:
                    p.pop(key, None)
            p['challenges'].pop('soloKills', None)
            t['info']['frames'][-1]['participantFrames']['1'].pop('totalGold', None)
        elif name == 'unsupported_patch':
            m['info']['gameVersion'] = '16.20.999.1'
        yield name, m, t


def synthetic_assertions(name, result):
    """Expected outcomes, separate from the reconciliation data being tested."""
    if name == 'missing_frames':
        return all(c['reason'] == 'missing_frame' for c in result['checkpoints'] if c['targetMs'] == 900000)
    if name == 'duplicate_timestamp':
        return result['coverage']['frames'] == 42 and result['coverage']['snapshots'] == 420 and result['coverage']['duplicateTimestamps'] == {'900358': 2} and result['summary']['fail'] == 0
    if name == 'unknown_types':
        return result['coverage']['unknownEventTypes'].get('FUTURE_EVENT') == 1 and result['coverage']['unknownWardTypes'].get('FUTURE_WARD') == 1 and result['summary']['fail'] == 0
    if name == 'ambiguous_role':
        return result['opponents'][0]['reason'] == 'ambiguous_role' and result['opponents'][1]['reason'] == 'missing_opponent'
    if name == 'short_match':
        return all(c['reason'] == 'short_match' for c in result['checkpoints']) and result['summary']['fail'] > 0
    if name == 'surrender_false':
        return not any(result['surrender']['flags']) and not any(result['surrender']['earlyFlags'])
    if name == 'early_surrender':
        return all(result['surrender']['earlyFlags'])
    if name == 'missing_optional':
        return result['coverage']['optionalFields']['wardsPlaced']['present'] == 9 and any(c['metric'] == 'finalGold' and c['subject'] == 1 and c['status'] == 'unavailable' for c in result['playerChecks'])
    if name == 'unsupported_patch':
        return result['context']['gameVersion'] == '16.20.999.1'
    return False


def build_report(manifest_path, match_raw_evidence=None):
    manifest = json.loads(manifest_path.read_text())
    real = []
    synthetic = []
    hashes = {}
    for entry in manifest['realSamples']:
        paths = [ROOT / entry['summary'], ROOT / entry['timeline']]
        match, timeline = [json.loads(p.read_text()) for p in paths]
        for p in paths:
            hashes[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
        result = audit(match, timeline)
        real.append({'sampleId': entry['id'], 'kind': 'real', 'audit': result})
        if entry.get('generateSynthetic'):
            for name, m, t in variations(match, timeline):
                result = audit(m, t)
                passed = synthetic_assertions(name, result)
                # Real reconciliation publishes all 112 pairs. Synthetic output
                # keeps only divergent/missing pairs to avoid repeated evidence.
                result['playerChecks'] = [c for c in result['playerChecks'] if c['status'] != 'pass']
                result['objectiveChecks'] = [c for c in result['objectiveChecks'] if c['status'] != 'pass']
                synthetic.append({'sampleId': f'{entry["id"]}:{name}', 'kind': 'synthetic', 'derivedFrom': entry['id'],
                                  'mutation': name, 'expectationPassed': passed, 'audit': result})
    groups = Counter((r['audit']['context']['gameVersion'], r['audit']['context']['queueId'], r['audit']['context']['mapId']) for r in real)
    return {'auditVersion': 1, 'manifest': str(manifest_path.relative_to(ROOT)), 'sourceSha256': hashes,
            'realSampleN': len(real), 'syntheticSampleN': len(synthetic),
            'coverageByVersionQueueMap': [{'gameVersion': version, 'patch': '.'.join(version.split('.')[:2]), 'queueId': queue, 'mapId': map_id, 'realN': n} for (version, queue, map_id), n in sorted(groups.items())],
            'supportMatrix': manifest['supportMatrix'],
            'matchRawAvailability': match_raw_evidence or {'status': 'not_measured', 'scope': 'No database queried by offline auditor', 'rows': None, 'summaryAvailable': None, 'timelineAvailable': None, 'limitation': 'Repository fixture count does not establish database or production coverage.'},
            'limitations': ['Only one real patch currently checked in; synthetic variants do not establish cross-patch support.', 'No population representativeness or full BR server coverage is claimed.', 'Truncated synthetic timelines intentionally produce reconciliation failures; expectationPassed tests that they are detected.'],
            'real': real, 'synthetic': synthetic}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=ROOT / 'docs/analysis/corpus-manifest.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/analysis/corpus-audit.json')
    parser.add_argument('--match-raw-evidence', type=Path)
    args = parser.parse_args()
    evidence = json.loads(args.match_raw_evidence.read_text()) if args.match_raw_evidence else None
    report = build_report(args.manifest.resolve(), evidence)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    failures = sum(r['audit']['summary']['fail'] + len(r['audit']['integrityIssues']) for r in report['real'])
    failures += sum(not r['expectationPassed'] for r in report['synthetic'])
    print(json.dumps({'realN': report['realSampleN'], 'syntheticN': report['syntheticSampleN'], 'unexpectedFailures': failures, 'output': str(args.output)}))
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
