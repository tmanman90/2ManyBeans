from pathlib import Path
import hashlib,json,os,re,shlex,signal,subprocess,sys,time
root=Path(__file__).resolve().parents[3]
qa=Path(__file__).resolve().parent
runtime=root/'docs/qa/espresso-implementation/.runtime'
suite=sys.argv[1]
assert suite in ['browser','live-generic']
arguments=sys.argv[2:]
assert (suite=='browser' and not arguments) or (suite=='live-generic' and len(arguments)==1 and re.fullmatch(r'G0[1-8]',arguments[0]))
lock=Path('/tmp/doxin-heavy.lock')
try:lock.mkdir()
except FileExistsError:raise SystemExit('DEFER: heavy lock occupied')
owner=f'espresso-setup-root {suite} {os.getpid()}'
(lock/'owner').write_text(owner)
def manifest():
 paths=[p for d in ['src','api','scripts'] for p in (root/d).rglob('*') if p.is_file()]
 paths.extend([root/'package.json',root/'package-lock.json',root/'vite.config.js',qa/'live-oracles.json',qa/f'{suite}.mjs',Path(__file__).resolve()])
 data={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
 return {'digest':hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest(),'files':data}
try:
 idle=re.search(r'([\d.]+)% idle',subprocess.check_output(['top','-l','1','-n','0'],text=True))
 if not idle or float(idle[1])<=40:raise SystemExit('DEFER: CPU idle <=40%')
 env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','USER','LOGNAME','SHELL']}
 java=runtime/'jdk-21.0.12.1+1-jre/Contents/Home'
 env.update({'JAVA_HOME':str(java),'PATH':str(java/'bin')+':'+env['PATH'],'JAVA_TOOL_OPTIONS':'-Xmx512m -XX:ActiveProcessorCount=2','CI':'true','FIREBASE_CLI_DISABLE_USAGE_TRACKING':'true'})
 cmd=['node',str(runtime/'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:exec','--only','auth,firestore','--project','demo-espresso-acceptance','--config',str(root/'docs/qa/espresso-implementation/emulator-config.json'),shlex.join(['node',str(qa/f'{suite}.mjs'),*arguments])]
 before=manifest();run_id=int(time.time()*1000);log=qa/f'{suite}-{arguments[0] if arguments else "app"}-{run_id}.log'
 with log.open('w') as f:
  p=subprocess.Popen(cmd,env=env,cwd=root,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=p.wait(timeout=480)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=15);code=124
 after=manifest();receipt={'suite':suite,'arguments':arguments,'cpuIdlePercent':float(idle[1]),'sourceStable':before==after,'sourceBefore':before,'sourceAfter':after,'exitCode':code,'log':log.name}
 (qa/f'{suite}-{run_id}-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({k:v for k,v in receipt.items() if not k.startswith('source')}))
 if before!=after:code=1
finally:
 if (lock/'owner').read_text()==owner:(lock/'owner').unlink();lock.rmdir()
sys.exit(code)
