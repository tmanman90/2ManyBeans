from pathlib import Path
import subprocess,time,sys
root=Path(__file__).resolve().parents[3]
for case in [f"G0{i}" for i in range(1,9)]:
 deadline=time.monotonic()+1200
 while True:
  result=subprocess.run([sys.executable,str(Path(__file__).with_name('run-check.py')),'live-generic',case],cwd=root,capture_output=True,text=True)
  output=result.stdout+result.stderr
  if 'DEFER:' in output:
   if time.monotonic()>deadline:print(case+' resource gate timeout',flush=True);sys.exit(1)
   time.sleep(10);continue
  print(output,flush=True)
  if result.returncode:sys.exit(result.returncode)
  break
