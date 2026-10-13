#!/usr/bin/env python3
"""Run isolated study tasks sequentially. Records exit status; stops on failure.

Resume a verified stopped task with --from N. Does not infer process liveness
from the status file. Logs contain no Riot credentials.
"""
import argparse, datetime, json, os, pathlib, signal, subprocess, time

p=argparse.ArgumentParser()
p.add_argument('--from', dest='start',type=int,default=0)
p.add_argument('--through',type=int,default=100)
args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'docs/analysis/architecture-study'
logs=root/'.tmp/architecture-study-logs'
logs.mkdir(parents=True,exist_ok=True)
prefix=['taskset','-c','0,2','node','scripts/architecture-study/']
def script(name,*arguments):
 return prefix[:-1]+[prefix[-1]+name]+list(arguments)
def run(name,variants,workers=2,count=120,extra=()):
 return script('run.cjs','.tmp/architecture-study-corpus',str(out/(name+'.json')),
               '--variants='+variants,'--workers='+str(workers),'--count='+str(count),
               '--exclude-rejected=1',*extra)
tasks=[
 ('read-experiments',script('read-benchmark.cjs',str(out/'round-2-w2.json'),str(out/'read-experiments.json'))),
 ('rebuild',script('rebuild.cjs',str(out/'round-2-w2.json'),str(out/'rebuild.json'))),
 ('round-3-w2',run('round-3-w2','A,B,B2,C,D,E',extra=('--round=3',))),
 ('scale-w1',run('scale-w1','A,B2,E',workers=1,count=60)),
 ('scale-w2',run('scale-w2','E,B2,A',workers=2,count=60)),
 ('scale-w4',run('scale-w4','A,B2,E',workers=4,count=60)),
 ('scale-w2-slots2',run('scale-w2-slots2','A,B2,E',workers=2,count=60,extra=('--slots=2',))),
 ('arrival-1',run('arrival-1','A,E,D',extra=('--arrival-rate=1',))),
 ('arrival-2',run('arrival-2','A,E,D',extra=('--arrival-rate=2',))),
 ('history',script('history.cjs',str(out/'round-2-w2.json'),str(out/'history.json'),'5')),
 ('history-writes',run('history-writes','A,B2,C,E',count=60,extra=('--templates='+str(out/'history.json'),'--id-prefix=NEW_'))),
 ('history-reads',script('read-benchmark.cjs',str(out/'history-writes.json'),str(out/'history-reads.json'))),
]
status_path=out/'execution.json'
status=json.loads(status_path.read_text()) if status_path.exists() else {'tasks':{}}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save():status_path.write_text(json.dumps(status,indent=2)+'\n')
for index,(name,command) in enumerate(tasks):
 if index<args.start or index>args.through:continue
 entry={'index':index,'command':command,'startedAt':now(),'status':'running','log':str(logs/(name+'.log'))}
 status['tasks'][name]=entry;save()
 print('START',index,name,flush=True)
 with open(entry['log'],'w') as log:
  proc=subprocess.Popen(command,cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  entry['pid']=proc.pid;save()
  try: code=proc.wait(timeout=1800)
  except subprocess.TimeoutExpired:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
   code=124
 entry.update({'status':'passed' if code==0 else 'failed','exitCode':code,'endedAt':now()});save()
 print('END',index,name,code,flush=True)
 if code:
  # Clean remaining descendants after a failed parent, if any.
  try:os.killpg(proc.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  print(pathlib.Path(entry['log']).read_text()[-5000:],flush=True)
  raise SystemExit(code)
