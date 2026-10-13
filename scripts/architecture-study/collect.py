#!/usr/bin/env python3
"""Collect a resumable Riot corpus. Key is prompted, never persisted/logged.

python3 scripts/architecture-study/collect.py /path/out --target 120
Uses conservative pacing plus Riot Retry-After. Stores original responses gzip.
"""
import argparse, getpass, gzip, hashlib, json, pathlib, random, time
import urllib.request, urllib.error

p = argparse.ArgumentParser()
p.add_argument('directory', type=pathlib.Path)
p.add_argument('--target', type=int, default=120)
args = p.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)
key = getpass.getpass('Riot key (not stored): ')
last = 0
requests = 0

def fetch(host, route):
    global last, requests
    for attempt in range(5):
        time.sleep(max(0, 1.3 - (time.monotonic() - last)))
        last = time.monotonic()
        req = urllib.request.Request('https://' + host + '.api.riotgames.com' + route,
                                     headers={'X-Riot-Token': key, 'User-Agent': 'high-br-lol-graph-architecture-study/1.0'})
        requests += 1
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                # Riot error body has no request headers; redact defensively anyway.
                detail = exc.read(1000).decode(errors='replace').replace(key, '[redacted]')
                raise SystemExit('Riot authorization failed: HTTP ' + str(exc.code) + ' ' + detail)
            if exc.code == 404: return None
            if exc.code == 429:
                delay = float(exc.headers.get('Retry-After', '120')) + 1
            elif exc.code >= 500: delay = 2 ** attempt
            else: raise SystemExit('Riot request failed: HTTP ' + str(exc.code))
            print('Retry HTTP', exc.code, 'wait', delay, flush=True)
            time.sleep(delay)
        except (TimeoutError, urllib.error.URLError):
            if attempt == 4: raise SystemExit('Riot network unavailable after retries')
            time.sleep(2 ** attempt)
    raise SystemExit('Retry budget exhausted')

manifest_path = args.directory / 'manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
    'collectedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'sampling': 'BR challenger seed histories, queues 420/440 plus unfiltered; convenience sample, not population representative',
    'matches': [], 'requestsThisRun': 0,
}
seen = {m['id'] for m in manifest['matches']}
league = fetch('br1', '/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5')
players = [e['puuid'] for e in league['entries'] if e.get('puuid')]
random.Random(20261007).shuffle(players)
if not players: raise SystemExit('No PUUIDs in league response')
print('Seed players', len(players), 'existing matches', len(seen), flush=True)
for index, player in enumerate(players[:40]):
    if len(seen) >= args.target: break
    queue = (420, 440, None, 420)[index % 4]
    query = '?start=0&count=12' + (('&queue=' + str(queue)) if queue else '')
    ids = fetch('americas', '/lol/match/v5/matches/by-puuid/' + player + '/ids' + query) or []
    for mid in ids:
        if mid in seen or len(seen) >= args.target: continue
        prefix = args.directory / mid
        pair = []
        for suffix in ('summary', 'timeline'):
            file = pathlib.Path(str(prefix) + '.' + suffix + '.json.gz')
            if file.exists():
                payload = json.loads(gzip.decompress(file.read_bytes()))
            else:
                payload = fetch('americas', '/lol/match/v5/matches/' + mid + ('/timeline' if suffix == 'timeline' else ''))
                if payload is None: break
                file.write_bytes(gzip.compress(json.dumps(payload, separators=(',', ':')).encode(), mtime=0))
            pair.append((payload, file))
        if len(pair) != 2: continue
        summary, timeline = pair[0][0], pair[1][0]
        entry = {'id': mid, 'queueId': summary['info']['queueId'], 'mapId': summary['info']['mapId'],
                 'version': summary['info']['gameVersion'], 'duration': summary['info']['gameDuration'],
                 'events': sum(len(f.get('events', [])) for f in timeline['info']['frames'])}
        for suffix, (_, file) in zip(('summary', 'timeline'), pair):
            entry[suffix] = file.name
            entry[suffix + 'Sha256'] = hashlib.sha256(file.read_bytes()).hexdigest()
        manifest['matches'].append(entry)
        seen.add(mid)
        manifest['requestsThisRun'] = requests
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print('Collected', len(seen), mid, 'queue', entry['queueId'], 'events', entry['events'], flush=True)
print('Done', len(seen), 'pairs;', requests, 'requests', flush=True)
