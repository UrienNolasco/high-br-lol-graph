#!/usr/bin/env python3
"""Rebuild MET-34 design payloads from checked-in source evidence; no services."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/review'
summary = json.loads((ROOT / 'exemplo_partida_BR1_3200579475.json').read_text())
timeline = json.loads((ROOT / 'exemplo_partida_timeline_BR1_3200579475.json').read_text())
match_id = summary['metadata']['matchId']
participants = summary['info']['participants']


def metric(player, code, label, field, unit='count', denominator_field=None):
    value = player.get(field)
    evidence = [{'source': 'match', 'field': f'info.participants[{participants.index(player)}].{field}', 'value': value}]
    denominator = None
    if denominator_field:
        team = [p for p in participants if p['teamId'] == player['teamId']]
        values = [p.get(denominator_field) for p in team]
        total = sum(values) if all(v is not None for v in values) else None
        denominator = {'value': total, 'unit': unit, 'population': 'five participants on subject team'}
        evidence.extend({'source': 'match', 'field': f'info.participants[{participants.index(p)}].{denominator_field}', 'value': p.get(denominator_field)} for p in team)
        value = value / total * 100 if value is not None and total else None
        unit = 'percent'
    reason = None if value is not None else ('zero_denominator' if denominator and denominator['value'] == 0 else 'missing_field')
    return {'label': label, 'metricId': code, 'metricVersion': 1, 'processingVersion': 1,
            'processedAt': '2026-09-23T00:00:00.000Z', 'matchId': match_id,
            'subject': {'kind': 'participant', 'id': player['puuid']}, 'unit': unit,
            'window': None, 'denominator': denominator,
            'quality': {'validSamples': int(value is not None), 'totalSamples': 1, 'coverage': int(value is not None), 'unknownEvents': 0, 'reconciliationIssues': []},
            'evidence': evidence, 'value': value,
            'origin': 'unavailable' if value is None else 'derived' if denominator else 'observed',
            'reason': reason, 'method': f'{field} / team sum({denominator_field}) * 100' if denominator else field}


def event_ref(fi, ei, event):
    return {'id': f'{match_id}:{fi}:{ei}', 'timestampMs': event['timestamp'],
            'type': event['type'], 'frameIndex': fi, 'eventIndex': ei,
            'fields': {k: event[k] for k in ['victimId', 'killerId', 'teamId', 'killerTeamId', 'monsterType', 'buildingType'] if k in event}}


def report(champion):
    p = next(p for p in participants if p['championName'] == champion)
    events = [(fi, ei, e) for fi, f in enumerate(timeline['info']['frames']) for ei, e in enumerate(f['events'])]
    death = next((fi, ei, e) for fi, ei, e in events if e['type'] == 'CHAMPION_KILL' and e['victimId'] == p['participantId'] and 1190000 < e['timestamp'] < 1200000)
    objectives = [(fi, ei, e) for fi, ei, e in events if e['type'] in ('BUILDING_KILL', 'ELITE_MONSTER_KILL') and death[2]['timestamp'] < e['timestamp'] <= death[2]['timestamp'] + 60000 and (200 if e.get('teamId') == 100 else 100 if e.get('teamId') == 200 else e.get('killerTeamId')) != p['teamId']]
    assert len(objectives) == 2
    return {'exampleKind': 'design-contract-with-real-fixture-values', 'schemaVersion': 'proposal-1',
            'matchId': match_id, 'participant': {'puuid': p['puuid'], 'riotId': f"{p.get('riotIdGameName', champion)}#{p.get('riotIdTagline', '')}", 'champion': champion, 'role': p['teamPosition']},
            'context': {'queueId': summary['info']['queueId'], 'mapId': summary['info']['mapId'], 'gameVersion': summary['info']['gameVersion'], 'gameDurationSeconds': summary['info']['gameDuration'], 'win': p['win'], 'historicalReference': None, 'historicalReferenceReason': 'insufficient_sample'},
            'dimensions': [
                {'id': 'resources', 'label': 'Recursos', 'metrics': [metric(p, 'E04', 'Ouro do time', 'goldEarned', 'gold', 'goldEarned')]},
                {'id': 'combat', 'label': 'Combate', 'metrics': [metric(p, 'C02', 'Dano a campeões do time', 'totalDamageDealtToChampions', 'damage', 'totalDamageDealtToChampions'), metric(p, 'C04.heal', 'Cura em aliados', 'totalHealsOnTeammates'), metric(p, 'C04.shield', 'Escudos em aliados', 'totalDamageShieldedOnTeammates')]},
                {'id': 'vision', 'label': 'Visão', 'metrics': [metric(p, 'V03.placed', 'Wards colocadas', 'wardsPlaced'), metric(p, 'V03.removed', 'Wards removidas', 'wardsKilled')]},
                {'id': 'structures', 'label': 'Estruturas', 'metrics': [metric(p, 'O03', 'Dano a torres do time', 'damageDealtToTurrets', 'damage', 'damageDealtToTurrets')]},
            ],
            'episodes': [{'id': f'{match_id}:death:{death[0]}:{death[1]}', 'label': 'Morte e objetivos adversários nos 60 s seguintes', 'origin': 'derived', 'unit': 'death', 'value': 1, 'eligibleDeathsInThisExample': 1, 'window': {'startMs': death[2]['timestamp'], 'endMs': death[2]['timestamp'] + 60000, 'bounds': '(]'}, 'censored': False, 'evidenceIds': [event_ref(*row)['id'] for row in [death, *objectives]], 'limitation': 'Proximidade temporal; não demonstra que a morte causou os objetivos. Este exemplo contém um episódio, não a contagem de todas as mortes.'}],
            'evidence': [event_ref(*row) for row in [death, *objectives]]}


examples = {'notice': 'Proposta de consumo MET-34; não é resposta de endpoint existente. Dados reais da fixture, timestamp de processamento ilustrativo. Nenhum feedback de jogadores foi coletado.', 'reports': [report('Fiora'), report('Milio')]}
OUT.mkdir(exist_ok=True)
serialized = json.dumps(examples, ensure_ascii=False, indent=2) + '\n'
(OUT / 'payloads.json').write_text(serialized)
(OUT / 'examples.js').write_text('window.REVIEW_EXAMPLES = ' + serialized.rstrip() + ';\n')
print('Generated 2 reports, 4 dimensions each, 14 metrics and 6 linked evidence records from the fixture.')
