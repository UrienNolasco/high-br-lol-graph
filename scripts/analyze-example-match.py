#!/usr/bin/env python3
"""Offline, reproducible exploration of the two checked-in Match-V5 fixtures.

No credentials, external services or application/database mutations. Outputs are
descriptive measurements, not causal estimates or production metric contracts.
Run from any directory: python3 scripts/analyze-example-match.py
"""
from collections import Counter, defaultdict
from pathlib import Path
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'analysis'
MATCH_FILE = ROOT / 'exemplo_partida_BR1_3200579475.json'
TIMELINE_FILE = ROOT / 'exemplo_partida_timeline_BR1_3200579475.json'
WARD_TYPES = {'YELLOW_TRINKET', 'BLUE_TRINKET', 'SIGHT_WARD', 'CONTROL_WARD'}
EVENT_RETENTION = {
    'CHAMPION_KILL': 'Partial: killer/victim position and timestamp; explicit linkage, assistants, bounties and death recap discarded.',
    'WARD_PLACED': 'Partial: creator-associated timestamp/type stored, including UNDEFINED; fabricated coordinates 0,0.',
    'WARD_KILL': 'Ignored by active parser (handler has no persistence).',
    'ITEM_PURCHASED': 'Item ID/timestamp/type stored, except purchases removed by undo handling.',
    'ITEM_SOLD': 'Item ID/timestamp/type stored; final build mapper ignores sale effects.',
    'ITEM_UNDO': 'Partial: beforeId/time stored and preceding buy removed; afterId/goldGain discarded.',
    'SKILL_LEVEL_UP': 'Partial: Q/W/E/R sequence stored; timestamps and levelUpType discarded.',
    'ELITE_MONSTER_KILL': 'Partial: type/subtype, beneficiary team, timestamp and killer persisted in MatchTeam.objectivesTimeline; assistants and other fields remain in MatchRaw.',
    'BUILDING_KILL': 'Partial: type/lane, beneficiary team, timestamp and killer persisted in MatchTeam.objectivesTimeline; original owner, tower tier and other fields remain in MatchRaw.',
}


def retention(source, path):
    """Audit of analytical projections; both complete payloads also live in MatchRaw."""
    if source == 'match':
        prefix = 'info.participants[].'
        if path.startswith(prefix):
            field = path[len(prefix):].split('.')[0].split('[')[0]
            if field in {'challenges', 'perks'} or field.endswith('Pings'):
                return 'Stored as JSON; no dedicated analytical use of this field identified'
            if field in {'puuid', 'summonerName', 'championId', 'championName', 'teamId',
                         'teamPosition', 'individualPosition', 'lane', 'win', 'kills', 'deaths',
                         'assists', 'goldEarned', 'totalDamageDealtToChampions', 'totalDamageTaken',
                         'visionScore', 'summoner1Id', 'summoner2Id'}:
                return 'Used by active match parser / mapped to persisted participant'
            if field in {'totalMinionsKilled', 'neutralMinionsKilled'}:
                return 'Merged into persisted totalCs and used for aggregate CSPM; separate components remain in MatchRaw'
            return 'Not retained from this match field by active parser; some equivalents may exist in timeline/challenges'
        if path.startswith('info.teams[].objectives.'):
            return 'Complete totals retained in MatchRaw.summary only; persistence replaces parser totals with objective event array'
        if path in {'info.teams[].teamId', 'info.teams[].win', 'info.teams[].bans[].championId'}:
            return 'Stored (positive champion IDs only for bans)'
        if path in {'metadata.matchId', 'info.gameCreation', 'info.gameDuration', 'info.gameMode',
                    'info.queueId', 'info.gameVersion', 'info.mapId'}:
            return 'Stored in Match'
        return 'Not retained as a dedicated field by active match parser'
    prefix = 'info.frames[].participantFrames.*.'
    if path.startswith(prefix):
        suffix = path[len(prefix):]
        if suffix in {'totalGold', 'xp', 'minionsKilled', 'jungleMinionsKilled',
                      'damageStats.totalDamageDoneToChampions', 'position.x', 'position.y'}:
            return 'Used for persisted minute arrays / sampled path; CS components merged'
        return 'Not retained by active timeline parser'
    if path.startswith('info.frames[].events[]'):
        return 'Depends on event type; see eventsByType.backendRetention in metrics JSON'
    if path == 'info.frames[].timestamp':
        return 'Stored in path samples; floored as minute-array index'
    return 'Metadata/association or unretained; not a dedicated analytical metric'


def ratio(a, b, scale=1):
    return round(a / b * scale, 4) if b else None


def clock(ms):
    seconds = ms // 1000
    return f'{seconds // 60:02d}:{seconds % 60:02d}'


def leaf_inventory(value, prefix='', result=None):
    """Traverse every value; merge list indices and participant-frame IDs."""
    if result is None:
        result = defaultdict(Counter)
    if isinstance(value, dict):
        for key, item in value.items():
            component = '*' if prefix.endswith('participantFrames') else key
            leaf_inventory(item, f'{prefix}.{component}' if prefix else component, result)
    elif isinstance(value, list):
        if not value:
            result[prefix + '[]']['empty_list'] += 1
        for item in value:
            leaf_inventory(item, prefix + '[]', result)
    else:
        result[prefix][type(value).__name__] += 1
    return result


def main():
    m = json.loads(MATCH_FILE.read_text())
    t = json.loads(TIMELINE_FILE.read_text())
    assert m['metadata']['matchId'] == t['metadata']['matchId']
    participants = m['info']['participants']
    by_id = {p['participantId']: p for p in participants}
    timeline_ids = {p['participantId']: p['puuid'] for p in t['info']['participants']}
    assert {pid: p['puuid'] for pid, p in by_id.items()} == timeline_ids
    assert set(m['metadata']['participants']) == set(t['metadata']['participants'])
    frames = t['info']['frames']
    assert all(a['timestamp'] <= b['timestamp'] for a, b in zip(frames, frames[1:]))
    events = sorted((e for f in frames for e in f['events']), key=lambda e: e['timestamp'])
    event_types = Counter(e['type'] for e in events)
    kills = [e for e in events if e['type'] == 'CHAMPION_KILL']
    placements = [e for e in events if e['type'] == 'WARD_PLACED']
    wards = [e for e in placements if e['wardType'] in WARD_TYPES]
    clears = [e for e in events if e['type'] == 'WARD_KILL']
    duration = m['info']['gameDuration']
    minutes = duration / 60
    winner = next(team['teamId'] for team in m['info']['teams'] if team['win'])
    assert [e['winningTeam'] for e in events if e['type'] == 'GAME_END'] == [winner]

    def team_of(pid):
        return by_id.get(pid, {}).get('teamId')

    def team_sum(team, field):
        return sum(p.get(field, 0) for p in participants if p['teamId'] == team)

    def gold_at(frame, team):
        return sum(v['totalGold'] for pid, v in frame['participantFrames'].items()
                   if team_of(int(pid)) == team)

    def nearest_frame(timestamp):
        return min(frames, key=lambda f: abs(f['timestamp'] - timestamp))

    def frame_before(timestamp):
        return max((f for f in frames if f['timestamp'] <= timestamp), key=lambda f: f['timestamp'])

    def gold_diff(frame, team=100):
        return gold_at(frame, team) - gold_at(frame, 300 - team)

    def windows(source, key, pid):
        return {str(minute): sum(e[key] == pid and e['timestamp'] <= minute * 60000
                                for e in source) for minute in (5, 10, 15, 20)}

    objectives = []
    for e in events:
        if e['type'] not in {'BUILDING_KILL', 'ELITE_MONSTER_KILL'}:
            continue
        building = e['type'] == 'BUILDING_KILL'
        # BUILDING_KILL.teamId identifies the destroyed building's owner.
        beneficiary = 300 - e['teamId'] if building else e['killerTeamId']
        assert beneficiary in (100, 200)
        if e['killerId']:
            assert team_of(e['killerId']) == beneficiary
        kind = e['buildingType'] if building else e['monsterType']
        pre = [k for k in kills if e['timestamp'] - 60000 <= k['timestamp'] < e['timestamp']]
        before = frame_before(e['timestamp'])
        after = frame_before(min(e['timestamp'] + 180000, frames[-1]['timestamp']))
        objectives.append({
            'timestampMs': e['timestamp'], 'time': clock(e['timestamp']),
            'type': kind, 'subType': e.get('monsterSubType') or e.get('towerType'),
            'teamId': beneficiary, 'destroyedTeamId': e.get('teamId') if building else None,
            'killerId': e['killerId'], 'assistants': e.get('assistingParticipantIds', []),
            'position': e.get('position'), 'lane': e.get('laneType'),
            'bountyField': e.get('bounty', 0),
            'killsByBeneficiaryPrevious60s': sum(team_of(k['killerId']) == beneficiary for k in pre),
            'deathsByBeneficiaryPrevious60s': sum(team_of(k['victimId']) == beneficiary for k in pre),
            'knownWardPlacementsPrevious90s': {
                str(team): sum(e['timestamp'] - 90000 <= w['timestamp'] < e['timestamp']
                               and team_of(w['creatorId']) == team for w in wards)
                for team in (100, 200)},
            'wardKillsPrevious90s': {
                str(team): sum(e['timestamp'] - 90000 <= w['timestamp'] < e['timestamp']
                               and team_of(w['killerId']) == team for w in clears)
                for team in (100, 200)},
            'goldWindow': {
                'startFrameMs': before['timestamp'], 'endFrameMs': after['timestamp'],
                'differenceBefore': gold_diff(before, beneficiary),
                'differenceAfter': gold_diff(after, beneficiary),
                'differenceChange': gold_diff(after, beneficiary) - gold_diff(before, beneficiary),
                'nominalHorizonSeconds': 180,
                'caution': 'Whole-map change across sampled frames; not gold caused by the objective.'},
        })

    players = []
    validations = []
    for p in participants:
        pid, team = p['participantId'], p['teamId']
        pk = [e for e in kills if e['killerId'] == pid]
        pd = [e for e in kills if e['victimId'] == pid]
        pa = [e for e in kills if pid in e.get('assistingParticipantIds', [])]
        solo = [e for e in pk if not e.get('assistingParticipantIds')]
        solo_deaths = [e for e in pd if not e.get('assistingParticipantIds') and e['killerId'] in by_id]
        pw = [e for e in wards if e['creatorId'] == pid]
        pc = [e for e in clears if e['killerId'] == pid]
        last = frames[-1]['participantFrames'][str(pid)]
        checks = {
            'kills': len(pk) == p['kills'], 'deaths': len(pd) == p['deaths'],
            'assists': len(pa) == p['assists'], 'wardsPlaced': len(pw) == p['wardsPlaced'],
            'wardsKilled': len(pc) == p['wardsKilled'],
            'controlWards': sum(e['wardType'] == 'CONTROL_WARD' for e in pw) == p['detectorWardsPlaced'],
            'soloKills': len(solo) == p['challenges'].get('soloKills'),
            'finalGold': last['totalGold'] == p['goldEarned'],
            'finalCS': last['minionsKilled'] + last['jungleMinionsKilled'] == p['totalMinionsKilled'] + p['neutralMinionsKilled'],
            'finalDamage': last['damageStats']['totalDamageDoneToChampions'] == p['totalDamageDealtToChampions'],
        }
        validations.append({'participantId': pid, 'checks': checks})
        opponent = next(q for q in participants if q['teamId'] != team and q['teamPosition'] == p['teamPosition'])
        checkpoints = {}
        for minute in (5, 10, 15, 20):
            f = nearest_frame(minute * 60000)
            a = f['participantFrames'][str(pid)]
            b = f['participantFrames'][str(opponent['participantId'])]
            checkpoints[str(minute)] = {
                'frameTimestampMs': f['timestamp'], 'offsetMs': f['timestamp'] - minute * 60000,
                'gold': a['totalGold'], 'cs': a['minionsKilled'] + a['jungleMinionsKilled'],
                'laneCs': a['minionsKilled'], 'jungleCs': a['jungleMinionsKilled'],
                'xp': a['xp'], 'level': a['level'], 'currentGold': a['currentGold'],
                'goldDifference': a['totalGold'] - b['totalGold'],
                'csDifference': a['minionsKilled'] + a['jungleMinionsKilled'] - b['minionsKilled'] - b['jungleMinionsKilled'],
                'xpDifference': a['xp'] - b['xp'], 'levelDifference': a['level'] - b['level'],
            }
        damage_share = ratio(p['totalDamageDealtToChampions'], team_sum(team, 'totalDamageDealtToChampions'))
        gold_share = ratio(p['goldEarned'], team_sum(team, 'goldEarned'))
        # Defined association, not blame or proof that the death caused a loss.
        death_windows = []
        for death in pd:
            losses = [o for o in objectives if o['teamId'] != team
                      and 0 < o['timestampMs'] - death['timestamp'] <= 60000]
            if losses:
                death_windows.append({'deathTimestampMs': death['timestamp'], 'deathTime': clock(death['timestamp']),
                                      'opponentObjectivesNext60s': [{'type': o['type'], 'timestampMs': o['timestampMs']} for o in losses]})
        players.append({
            'participantId': pid, 'champion': p['championName'], 'teamId': team,
            'role': p['teamPosition'], 'win': p['win'],
            'kills': p['kills'], 'deaths': p['deaths'], 'assists': p['assists'],
            'killParticipationPct': ratio(p['kills'] + p['assists'], team_sum(team, 'kills'), 100),
            'damage': p['totalDamageDealtToChampions'], 'damageSharePct': round(damage_share * 100, 4),
            'gold': p['goldEarned'], 'goldSharePct': round(gold_share * 100, 4),
            'damageShareOverGoldShare': ratio(damage_share, gold_share),
            'turretDamage': p['damageDealtToTurrets'],
            'turretDamageSharePct': ratio(p['damageDealtToTurrets'], team_sum(team, 'damageDealtToTurrets'), 100),
            'damageToEpicMonsters': p.get('damageDealtToEpicMonsters'),
            'damageToObjectives': p['damageDealtToObjectives'],
            'damageTypesToChampions': {k: p[k] for k in ('physicalDamageDealtToChampions', 'magicDamageDealtToChampions', 'trueDamageDealtToChampions')},
            'healsOnTeammates': p['totalHealsOnTeammates'], 'shieldsOnTeammates': p['totalDamageShieldedOnTeammates'],
            'allyHealShieldPerMinute': ratio(p['totalHealsOnTeammates'] + p['totalDamageShieldedOnTeammates'], minutes),
            'timeCCingOthers': p['timeCCingOthers'], 'damageSelfMitigated': p['damageSelfMitigated'],
            'timeSpentDeadSeconds': p['totalTimeSpentDead'],
            'timeSpentDeadPct': ratio(p['totalTimeSpentDead'], p['timePlayed'], 100),
            'soloKillsNoRegisteredAssist': len(solo),
            'soloKillsBefore15': sum(e['timestamp'] < 900000 for e in solo),
            'soloDeathsBefore15': sum(e['timestamp'] < 900000 for e in solo_deaths),
            'wardsPlaced': len(pw), 'wardsKilled': len(pc),
            'wardsByType': dict(Counter(e['wardType'] for e in pw)),
            'unknownWardEvents': sum(e['creatorId'] == pid and e['wardType'] not in WARD_TYPES for e in placements),
            'wardsPerMinute': ratio(len(pw), minutes),
            'wardPlacementsUntil': windows(wards, 'creatorId', pid),
            'wardKillsUntil': windows(clears, 'killerId', pid),
            'controlWardsPlaced': p['detectorWardsPlaced'],
            'controlWardsBought': p['visionWardsBoughtInGame'], 'visionScore': p['visionScore'],
            'checkpoints': checkpoints,
            'maxSampledCurrentGold': max(f['participantFrames'][str(pid)]['currentGold'] for f in frames),
            'framesWithCurrentGoldAtLeast1500': sum(f['participantFrames'][str(pid)]['currentGold'] >= 1500 for f in frames),
            'framesObserved': len(frames),
            'shutdownBountyFieldsReceived': sum(e.get('shutdownBounty', 0) for e in pk),
            'shutdownBountyFieldsConceded': sum(e.get('shutdownBounty', 0) for e in pd),
            'deathsFollowedByOpponentObjectiveWithin60s': death_windows,
            'finalInventorySlots0to6': [p[f'item{i}'] for i in range(7)],
            'roleBoundItem': p.get('roleBoundItem'),
            'selectedStoredButUnusedChallenges': {k: p['challenges'].get(k) for k in (
                'soloKills', 'skillshotsDodged', 'skillshotsHit', 'saveAllyFromDeath',
                'outnumberedKills', 'enemyChampionImmobilizations', 'turretPlatesTaken',
                'laneMinionsFirst10Minutes', 'jungleCsBefore10Minutes', 'wardsGuarded',
                'epicMonsterSteals', 'bountyGold')},
        })

    teams = []
    for team in (100, 200):
        team_players = [p for p in players if p['teamId'] == team]
        teams.append({
            'teamId': team, 'win': team == winner,
            **{k: sum(p[k] for p in team_players) for k in (
                'kills', 'deaths', 'assists', 'damage', 'gold', 'turretDamage',
                'wardsPlaced', 'wardsKilled', 'controlWardsPlaced', 'controlWardsBought',
                'visionScore', 'healsOnTeammates', 'shieldsOnTeammates', 'timeSpentDeadSeconds',
                'unknownWardEvents')},
            'wardTypes': dict(Counter(e['wardType'] for e in wards if team_of(e['creatorId']) == team)),
            'wardPlacementsUntil': {str(minute): sum(p['wardPlacementsUntil'][str(minute)] for p in team_players) for minute in (5, 10, 15, 20)},
            'summaryObjectives': next(q['objectives'] for q in m['info']['teams'] if q['teamId'] == team),
            'knownWardsPerTeamMinute': ratio(sum(p['wardsPlaced'] for p in team_players), minutes),
        })

    # Reconcile the beneficiary, including structures whose killerId is 0.
    for team in teams:
        for kind, summary_key in [('DRAGON', 'dragon'), ('BARON_NASHOR', 'baron'),
                                  ('HORDE', 'horde'), ('RIFTHERALD', 'riftHerald'),
                                  ('TOWER_BUILDING', 'tower'), ('INHIBITOR_BUILDING', 'inhibitor')]:
            count = sum(o['type'] == kind and o['teamId'] == team['teamId'] for o in objectives)
            assert count == team['summaryObjectives'][summary_key]['kills'], (team['teamId'], kind, count)

    gold_series = []
    for f in frames:
        ts = f['timestamp']
        gold_series.append({
            'timestampMs': ts, 'time': clock(ts), 'blueGold': gold_at(f, 100),
            'redGold': gold_at(f, 200), 'blueGoldDifference': gold_diff(f),
            'blueKills': sum(e['timestamp'] <= ts and team_of(e['killerId']) == 100 for e in kills),
            'redKills': sum(e['timestamp'] <= ts and team_of(e['killerId']) == 200 for e in kills),
            'blueKnownWards': sum(e['timestamp'] <= ts and team_of(e['creatorId']) == 100 for e in wards),
            'redKnownWards': sum(e['timestamp'] <= ts and team_of(e['creatorId']) == 200 for e in wards),
        })
    trough = min(gold_series, key=lambda r: r['blueGoldDifference'])
    permanent_lead = next((row for i, row in enumerate(gold_series)
                           if row['blueGoldDifference'] > 0
                           and all(r['blueGoldDifference'] > 0 for r in gold_series[i:])), None)
    phase_metrics = []
    for start, end in [(0, 10), (10, 20), (20, 30), (30, duration / 60)]:
        start_ms, end_ms = round(start * 60000), round(end * 60000)
        phase_metrics.append({'fromMinute': start, 'toMinute': end, 'teams': {
            str(team): {
                'kills': sum(start_ms <= e['timestamp'] < end_ms and team_of(e['killerId']) == team for e in kills),
                'knownWardPlacements': sum(start_ms <= e['timestamp'] < end_ms and team_of(e['creatorId']) == team for e in wards),
                'wardKills': sum(start_ms <= e['timestamp'] < end_ms and team_of(e['killerId']) == team for e in clears),
            } for team in (100, 200)}})

    event_inventory = {}
    for kind in sorted(event_types):
        of_kind = [e for e in events if e['type'] == kind]
        event_inventory[kind] = {'count': len(of_kind), 'fields': sorted(leaf_inventory(of_kind)),
                                'backendRetention': EVENT_RETENTION.get(kind, 'Ignored by active timeline parser.')}
    inventory = {name: {path: dict(types) for path, types in sorted(leaf_inventory(data).items())}
                 for name, data in [('match', m), ('timeline', t)]}

    result = {
        'matchId': m['metadata']['matchId'], 'gameVersion': m['info']['gameVersion'],
        'queueId': m['info']['queueId'], 'durationSeconds': duration, 'winnerTeamId': winner,
        'sources': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (MATCH_FILE, TIMELINE_FILE)},
        'backendAudit': {
            'reviewedAt': '2026-09-22',
            'referenceCommit': 'fc7abf5',
            'scope': 'Static audit of analytical projections, not a production database inspection.',
            'rawRetention': 'Worker stores complete summary and timeline as gzip in MatchRaw. Ignored/discarded/not retained in projection notes does not mean absent from raw storage. Availability for a historical match must be checked.',
        },
        'definitions': {
            'knownWardTypes': sorted(WARD_TYPES),
            'unknownWards': 'Retained as a separate count; not presumed to be ordinary vision wards.',
            'checkpoints': 'Nearest actual frame, for descriptive analysis only; offsetMs exposes timing error. Predictive features must use past-only frames.',
            'soloKills': 'CHAMPION_KILL without registered assistingParticipantIds; agrees with challenges.soloKills in this fixture, not proof of an isolated 1v1.',
            'deathObjectiveWindow': 'Opposing objective occurs in (death, death+60s]; windows can overlap and imply no causality.',
            'objectiveGoldWindow': 'Last frame at/before capture versus last frame at/before capture+180s; includes activity across the map, not buff gold.',
            'damageGoldRatio': 'Damage share divided by gold share; descriptive, unadjusted for champion/role.',
        },
        'inventory': {'frames': len(frames), 'participantSnapshots': sum(len(f['participantFrames']) for f in frames),
                      'events': len(events), 'eventCounts': dict(event_types),
                      'participantTopLevelFields': len(set().union(*(p.keys() for p in participants))),
                      'challengeFields': sorted(set().union(*(p['challenges'].keys() for p in participants))),
                      'leafPaths': inventory, 'eventsByType': event_inventory},
        'quality': {
            'playerCrossChecks': validations,
            'unidentifiedWardEvents': sum(e['wardType'] not in WARD_TYPES for e in placements),
            'soulEventsWithUnknownTeam': [e for e in events if e['type'] == 'DRAGON_SOUL_GIVEN' and e['teamId'] not in (100, 200)],
            'plateEventsAfter14Minutes': sum(e['type'] == 'TURRET_PLATE_DESTROYED' and e['timestamp'] > 840000 for e in events),
            'frameCountVersusUniqueFloorMinutes': {'frames': len(frames), 'floorMinutes': len({f['timestamp']//60000 for f in frames})},
            'emptySummonerNames': sum(not p['summonerName'] for p in participants),
            'goldSpentAboveGoldEarned': [p['participantId'] for p in participants if p['goldSpent'] > p['goldEarned']],
        },
        'teams': teams, 'players': players, 'objectives': objectives, 'phases': phase_metrics,
        'goldTimeline': gold_series, 'comeback': {'largestSampledBlueDeficit': trough, 'firstPersistentSampledBlueLead': permanent_lead},
        'killMatrix': {str(pid): dict(Counter(e['victimId'] for e in kills if e['killerId'] == pid)) for pid in by_id},
    }
    # Fixture-specific independent source agreement: fail rather than publish
    # apparently precise numbers if the two payloads stop reconciling.
    failures = [(v['participantId'], key) for v in validations for key, ok in v['checks'].items() if not ok]
    result['quality']['crossCheckFailures'] = failures
    assert not failures, failures
    assert len(kills) == sum(p['kills'] for p in participants) == sum(p['deaths'] for p in participants)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'BR1_3200579475.metrics.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    with (OUT / 'BR1_3200579475.fields.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['source', 'path', 'value_types_and_observations', 'backend_retention_audit', 'raw_retention'])
        for source, paths in inventory.items():
            for path, counts in paths.items():
                writer.writerow([source, path, json.dumps(counts, sort_keys=True), retention(source, path),
                                 'Complete payload retained in MatchRaw by current worker; historical availability not inspected'])
    with (OUT / 'BR1_3200579475.timeline.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(gold_series[0]))
        writer.writeheader()
        writer.writerows(gold_series)
    print(json.dumps({
        'matchId': result['matchId'], 'frames': len(frames), 'events': len(events),
        'leafPaths': {k: len(v) for k, v in inventory.items()},
        'playerCrossChecks': len(validations) * len(validations[0]['checks']),
        'objectiveCrossChecks': 12, 'crossCheckFailures': failures,
        'teams': teams, 'comeback': result['comeback'],
        'output': str(OUT),
    }, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
