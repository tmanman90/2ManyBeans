"""Execute fixed scenarios serially; the child owns CPU/lock and source receipts."""
from pathlib import Path
import json
import subprocess
import sys
import time

evidence = Path(__file__).resolve().parent
root = evidence.parents[2]
group = sys.argv[1] if len(sys.argv) > 1 else 'critical'
critical = [('E04', 'clear', 'E04.ambiguous'), ('E04', 'clear', 'E04.grind-only'), ('E07', 'casual', 'E07.duplicate'), ('E07', 'clear', 'E07.stale'), ('E08', 'clear', 'E08.switch-save'), ('E11', 'clear', 'E11.switch-save'), ('E12', 'clear', 'E12.replay')]
if group == 'critical':
    cases = critical
elif group == 'conversations':
    cases = [(f'E{case:02}', variant) for case in range(1, 13) for variant in ['clear', 'casual', 'incomplete']]
elif group == 'undo-intent':
    cases = [('E07', 'clear', f'E07.{kind}') for kind in ['negated', 'hypothetical', 'ambiguous']]
elif group == 'writes':
    cases = [(case, variant) for case in ['E04', 'E06', 'E07'] for variant in ['clear', 'casual', 'incomplete']]
else:
    raise SystemExit('Use critical, conversations, writes or undo-intent')
start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
if not 0 <= start < len(cases):
    raise SystemExit('Start index outside fixed matrix')
required_total = len(cases)
cases = cases[start:]
run_id = int(time.time())
records = []
report = evidence / f'matrix-{group}-{run_id}.json'
for args in cases:
    control = evidence / 'matrix-control.json'
    if control.exists() and json.loads(control.read_text()).get('stopAfterCurrent'):
        print('Root requested stop between scenarios; completed receipts are retained.', flush=True)
        break
    old = set(evidence.glob('live-espresso-*-manifest.json'))
    child = subprocess.run([sys.executable, str(evidence / 'run-emulator-smoke.py'), 'live-espresso', *args], cwd=root, text=True, capture_output=True)
    manifests = sorted(set(evidence.glob('live-espresso-*-manifest.json')) - old)
    record = {'case': args, 'exitCode': child.returncode, 'manifests': [p.name for p in manifests], 'message': child.stdout.strip() or child.stderr.strip()}
    records.append(record)
    report.write_text(json.dumps({'group': group, 'startIndex': start, 'records': records, 'requiredInBatch': len(cases), 'requiredInMatrix': required_total, 'semanticReview': 'pending'}, indent=2) + '\n')
    print(json.dumps(record), flush=True)
    if not manifests:
        print('Admission deferred; no scenario was executed. Stop this batch for root coordination.', flush=True)
        break
    if child.returncode:
        print('Scenario retained as failed; stop for diagnosis before more model calls.', flush=True)
        break
sys.exit(0 if len(records) == len(cases) and all(r['exitCode'] == 0 for r in records) else 1)
