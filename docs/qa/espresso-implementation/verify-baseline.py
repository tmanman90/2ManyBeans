"""Reproduce attributed regression failures on the untouched starting source.

Requires the task-owned .runtime/baseline-check git archive and reused local
dependencies. No network installation or application mutation is performed.
"""
from pathlib import Path
import json
import os
import re
import subprocess
import sys
import time

evidence = Path(__file__).resolve().parent
baseline = evidence / '.runtime/baseline-check'
commands = [
    ['node', 'scripts/v60-switch-runtime-contract.test.mjs'],
    ['node', 'scripts/handbrew-v60-cutover-contract.test.mjs'],
    ['node', '--import', str(evidence / 'installed-chrome.mjs'), 'scripts/verify-kalita-iced-ui.mjs'],
]
start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
lock = Path('/tmp/doxin-heavy.lock')
deadline = time.monotonic() + 55
while True:
    try:
        lock.mkdir()
        break
    except FileExistsError:
        if time.monotonic() >= deadline:
            raise SystemExit('DEFER: shared lock held')
        time.sleep(.25)
owner = f'espresso-root baseline {os.getpid()}'
(lock / 'owner').write_text(owner)
run_id = int(time.time())
records = []
try:
    for index, command in enumerate(commands[start:], start):
        match = re.search(r'([\d.]+)% idle', subprocess.check_output(['top', '-l', '1', '-n', '0'], text=True))
        idle = float(match[1]) if match else 0
        if idle <= 40:
            print('DEFER: CPU gate', flush=True)
            break
        log = evidence / f'baseline-{run_id}-{index}.log'
        with log.open('w') as out:
            result = subprocess.run(command, cwd=baseline, stdout=out, stderr=subprocess.STDOUT, timeout=120)
        record = {'index': index, 'command': command, 'cpuIdlePercent': idle, 'exitCode': result.returncode, 'log': log.name}
        records.append(record)
        print(json.dumps(record), flush=True)
finally:
    (evidence / f'baseline-{run_id}-receipt.json').write_text(json.dumps({'base': '58d1643', 'startIndex': start, 'records': records}, indent=2) + '\n')
    if (lock / 'owner').read_text() == owner:
        (lock / 'owner').unlink()
        lock.rmdir()
