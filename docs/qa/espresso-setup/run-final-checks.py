from pathlib import Path
import subprocess,re,time,json,hashlib,sys
root=Path(__file__).resolve().parents[3];qa=Path(__file__).resolve().parent
focused=json.loads((root/'docs/qa/espresso-implementation/final-focused.json').read_text())['commands']
prior=json.loads((root/'docs/qa/espresso-implementation/prior-chat-1791868156-receipt.json').read_text())['records']
commands=[x['command'] for x in focused]+[x['command'] for x in prior]+[['node','scripts/espresso-ui.test.mjs'],['node','scripts/recipe-scaling.test.mjs'],['node','--import',str(root/'docs/qa/espresso-implementation/installed-chrome.mjs'),'--test','scripts/aiden-generated-grind.test.mjs','scripts/aiden-foreground.test.mjs','scripts/aiden-modal-render.test.mjs']]
changed=subprocess.check_output(['git','diff','--name-only','72c9423','--','src','api'],cwd=root,text=True).splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard','src','api'],cwd=root,text=True).splitlines()
commands+=[['node','node_modules/eslint/bin/eslint.js',*sorted(set(changed))],['npm','run','lint']]
lock=Path('/tmp/doxin-heavy.lock');records=[];run=int(time.time());before=None
hashsource=lambda:hashlib.sha256(b''.join(str(p.relative_to(root)).encode()+p.read_bytes() for d in ['src','api','scripts'] for p in sorted((root/d).rglob('*')) if p.is_file())).hexdigest()
for index,cmd in enumerate(commands):
 deadline=time.monotonic()+1200
 while True:
  try:lock.mkdir()
  except FileExistsError:
   if time.monotonic()>deadline:raise SystemExit('Resource lock timeout')
   time.sleep(10);continue
  owner=f'espresso-final {__import__("os").getpid()}';(lock/'owner').write_text(owner)
  cpu=subprocess.check_output(['top','-l','1','-n','0'],text=True);idle=float(re.search(r'([\d.]+)% idle',cpu)[1])
  if idle>40:break
  (lock/'owner').unlink();lock.rmdir()
  if time.monotonic()>deadline:raise SystemExit('CPU timeout')
  time.sleep(10)
 try:
  if before is None:before=hashsource()
  log=qa/f'final-{run}-{index:02}.log'
  with log.open('w')as f:r=subprocess.run(cmd,cwd=root,stdout=f,stderr=subprocess.STDOUT,timeout=300)
  record={'command':cmd,'cpuIdlePercent':idle,'exitCode':r.returncode,'log':log.name};records.append(record);print(json.dumps(record),flush=True)
 finally:
  if (lock/'owner').read_text()==owner:(lock/'owner').unlink();lock.rmdir()
 (qa/f'final-{run}-receipt.json').write_text(json.dumps({'records':records,'sourceBefore':before,'sourceAfter':hashsource(),'requiredCommands':len(commands),'typecheck':'No project typecheck script; JavaScript app'},indent=2)+'\n')
 if r.returncode and cmd!=['npm','run','lint']:sys.exit(r.returncode)
