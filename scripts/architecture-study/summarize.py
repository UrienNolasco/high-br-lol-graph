#!/usr/bin/env python3
"""Derive compact comparisons from recorded runs; never invent missing runs."""
import json
import pathlib
import statistics

directory = pathlib.Path(__file__).resolve().parents[2] / 'docs/analysis/architecture-study'
result = {'units': {'storage': 'decimal MB', 'memory': 'MiB', 'cpu': 'milliseconds per match'}, 'primary': {}, 'scale': {}, 'arrivals': {}, 'history': {}}

def read(name):
    return json.loads((directory / (name + '.json')).read_text())

def compact(run):
    return {
        'variant': run['variant'], 'matches': run['matches'],
        'matchesPerSecond': run['matchesPerSecond'],
        'nodeCpuMsPerMatch': run['nodeCpuMs'] / run['matches'],
        'postgresCpuMsPerMatch': run['postgresCpuMs'] / run['matches'],
        'nodeAverageCores': run['nodeCpuMs'] / run['wallMs'],
        'postgresAverageCores': run['postgresCpuMs'] / run['wallMs'],
        'sumWorkerPeakRssMiB': run['sumWorkerPeakRss'] / 2**20,
        'relationsMB': sum(int(r['bytes']) for r in run['relations']) / 1e6,
        'walMB': run['walBytes'] / 1e6,
        'responseMs': run['responseMs'],
        'maximumOutstandingAtOneSecondSamples': max(b['due'] - b['completed'] for b in run['backlog']),
    }

for name in ['round-2-w2', 'round-3-w2']:
    runs = read(name)['runs']
    baseline = next(r for r in runs if r['variant'] == 'A')
    bulk = next(r for r in runs if r['variant'] == 'B2')
    result['primary'][name] = []
    for r in runs:
        c = compact(r)
        c['throughputGainPercentOverA'] = 100 * (r['matchesPerSecond'] / baseline['matchesPerSecond'] - 1)
        c['throughputGainPercentOverB2'] = 100 * (r['matchesPerSecond'] / bulk['matchesPerSecond'] - 1)
        result['primary'][name].append(c)

for section, names in [
    ('scale', ['scale-w1', 'scale-w2', 'scale-w4', 'scale-w2-slots2']),
    ('arrivals', ['arrival-1', 'arrival-2']),
    ('history', ['history-writes']),
]:
    for name in names:
        if (directory / (name + '.json')).exists():
            result[section][name] = [compact(r) for r in read(name)['runs']]

result['reads'] = {}
for name in ['read-experiments', 'history-reads']:
    if not (directory / (name + '.json')).exists():
        continue
    result['reads'][name] = [{
        'variant': r['variant'], 'cases': [{
            'filters': c['filters'], 'originalMs': c['originalMs'],
            'optimizedMedianMs': statistics.median(c['optimizedMs']),
            'originalError': c.get('originalError'), 'optimizedError': c.get('optimizedError'),
            'comparison': c.get('comparison'),
        } for c in r['cases']],
    } for r in read(name)['runs']]

(directory / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(directory / 'summary.json')
