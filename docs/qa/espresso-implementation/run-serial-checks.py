"""Root verification: one command at a time, with a fresh CPU receipt each."""
from pathlib import Path
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
suite = sys.argv[1] if len(sys.argv) > 1 else 'focused'
package = json.loads((root / 'package.json').read_text())
if suite == 'regression':
    commands = [shlex.split(command.strip()) for key in ['test:recipe-engine', 'test:recipe-scaling', 'test:brew-timing-memory', 'test:aiden-modal'] for command in package['scripts'][key].split('&&')]
    # The packaged Chromium binary is absent; dependency installs are outside
    # this run. Use the installed Chrome for this unchanged browser script.
    commands = [
        [command[0], '--import', str(evidence / 'installed-chrome.mjs'), *command[1:]]
        if command == ['node', 'scripts/verify-kalita-iced-ui.mjs'] or 'scripts/aiden-modal-render.test.mjs' in command else command
        for command in commands
    ]
elif suite == 'focused':
    commands = [['node', 'scripts/' + name + '.test.mjs'] for name in ['espresso-equipment-routing', 'espresso-recipe', 'espresso-command', 'ruphus-espresso-tools', 'ruphus-u4-tasting-context', 'ruphus-context', 'ruphus-evidence', 'ruphus-brew-evidence', 'ruphus-conversation-contract', 'ruphus-runtime-contracts', 'ruphus-reference-resolution', 'ruphus-provider-contract', 'ruphus-u2-runtime']]
elif suite == 'prior-chat':
    commands = [['node', 'scripts/' + name + '.test.mjs'] for name in ['ruphus-physical-grind', 'ruphus-proposal-continuity', 'ruphus-trial-recovery', 'ruphus-sensory-followup', 'ruphus-sensory-consistency', 'ruphus-repository-transaction', 'ruphus-method-resolution', 'ruphus-u3-runtime', 'ruphus-source-backend', 'ruphus-recipe-first-actions', 'ruphus-aiden-conversation', 'ruphus-aiden-preparation', 'ruphus-aiden-first-profile', 'ruphus-agent-endpoint']]
elif suite == 'lint':
    commands = [['npm', 'run', 'lint']]
elif suite == 'scoped-lint':
    changed = subprocess.check_output(['git', 'diff', '--name-only', '58d1643581c3a46aab797f8208989f16fd96162d', '--', 'src', 'api'], cwd=root, text=True).splitlines()
    added = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', 'src', 'api'], cwd=root, text=True).splitlines()
    files = sorted(path for path in set(changed + added) if Path(path).suffix in ['.js', '.jsx', '.mjs'] and (root / path).is_file())
    commands = [['node', 'node_modules/eslint/bin/eslint.js', *files]]
else:
    raise SystemExit('Unknown suite')
start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
required = len(commands)
if not 0 <= start < required:
    raise SystemExit('Start index outside fixed suite')
commands = commands[start:]
run_id = int(time.time())
records = []
lock = Path('/tmp/doxin-heavy.lock')
deadline = time.monotonic() + 55
while True:
    try:
        lock.mkdir()
        break
    except FileExistsError:
        if time.monotonic() >= deadline:
            raise SystemExit('DEFER: shared heavy lock held')
        time.sleep(0.25)
owner = f'espresso-root serial-{suite} {os.getpid()}'
(lock / 'owner').write_text(owner + '\n')
def source_hash():
    digest = hashlib.sha256()
    for folder in ['src', 'api', 'scripts']:
        for path in sorted((root / folder).rglob('*')):
            if path.is_file():
                digest.update(str(path.relative_to(root)).encode())
                digest.update(path.read_bytes())
    return digest.hexdigest()
before = source_hash()
status = 'passed'
try:
    for index, command in enumerate(commands, start=start):
        cpu = subprocess.check_output(['top', '-l', '1', '-n', '0'], text=True)
        match = re.search(r'([\d.]+)% idle', cpu)
        idle = float(match[1]) if match else 0
        if idle <= 40:
            status = 'deferred_cpu'
            records.append({'command': command, 'cpuIdlePercent': idle, 'executed': False})
            print(f'DEFER CPU {idle}%', flush=True)
            break
        log = evidence / f'{suite}-{run_id}-{index:02}.log'
        with log.open('w') as output:
            process = subprocess.run(command, cwd=root, text=True, stdout=output, stderr=subprocess.STDOUT, timeout=300)
        records.append({'command': command, 'cpuIdlePercent': idle, 'exitCode': process.returncode, 'log': log.name})
        print(json.dumps(records[-1]), flush=True)
        if process.returncode:
            status = 'failed'
            break
finally:
    after = source_hash()
    if before != after:
        status = 'source_changed'
    (evidence / f'{suite}-{run_id}-receipt.json').write_text(json.dumps({'suite': suite, 'startIndex': start, 'status': status, 'sourceBefore': before, 'sourceAfter': after, 'records': records, 'requiredCommands': required}, indent=2) + '\n')
    if (lock / 'owner').read_text().strip() == owner:
        (lock / 'owner').unlink()
        lock.rmdir()
sys.exit(0 if status == 'passed' else 1)
