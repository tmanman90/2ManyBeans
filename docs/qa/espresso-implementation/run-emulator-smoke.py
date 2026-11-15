from pathlib import Path
import hashlib
import json
import os
import re
import signal
import shlex
import subprocess
import sys
import time

evidence = Path(__file__).resolve().parent
root = evidence.parents[2]
runtime = evidence / '.runtime'
suite = sys.argv[1] if len(sys.argv) > 1 else 'emulator-smoke'
if suite not in ['emulator-smoke', 'emulator-U2', 'emulator-U2-browser', 'emulator-app-browser', 'live-espresso']:
    raise SystemExit('Unknown local verification suite')
arguments = sys.argv[2:]
if suite == 'live-espresso':
    if len(arguments) not in [2, 3] or not re.fullmatch(r'E(?:0[1-9]|1[0-2])', arguments[0]) or arguments[1] not in ['clear', 'casual', 'incomplete']:
        raise SystemExit('Use fixed live case E01-E12 and clear/casual/incomplete')
    if len(arguments) == 3 and arguments[2] not in ['E04.ambiguous', 'E04.grind-only', 'E07.duplicate', 'E07.stale', 'E07.negated', 'E07.hypothetical', 'E07.ambiguous', 'E08.switch-save', 'E11.switch-save', 'E12.replay']:
        raise SystemExit('Unknown fixed mutation perturbation')
elif arguments:
    raise SystemExit('Unexpected suite arguments')
lock = Path('/tmp/doxin-heavy.lock')
admission_deadline = time.monotonic() + 55
while True:
    try:
        lock.mkdir()
        break
    except FileExistsError:
        if time.monotonic() >= admission_deadline:
            raise SystemExit('DEFER: shared lock held')
        time.sleep(0.25)
owner = f'espresso-root {suite} {os.getpid()}'
(lock / 'owner').write_text(owner + '\n')
def source_manifest():
    paths = []
    for folder in ['src', 'api', 'scripts']:
        paths.extend(p for p in (root / folder).rglob('*') if p.is_file())
    for name in ['package.json', 'package-lock.json', 'vite.config.js', 'firestore.rules', 'eslint.config.js']:
        if (root / name).is_file():
            paths.append(root / name)
    paths.extend(p for p in evidence.iterdir() if p.is_file() and
                 (p.suffix in ['.mjs', '.jsx', '.html', '.py'] or p.name == 'emulator-config.json'))
    files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(set(paths))}
    return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
            'files': files, 'digest': hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()}
try:
    # Acquire atomically before the one-second CPU sample so another owner
    # cannot repeatedly take a newly freed slot during our admission sample.
    cpu = subprocess.check_output(['top', '-l', '1', '-n', '0'], text=True)
    idle = re.search(r'([\d.]+)% idle', cpu)
    if not idle or float(idle[1]) <= 40:
        raise SystemExit('DEFER: CPU idle gate')
    rules = (root / 'firestore.rules').read_bytes()
    (runtime / 'firestore.rules').write_bytes(rules)
    (evidence / 'emulator-rules-sha256.json').write_text(json.dumps({
        'source': 'firestore.rules', 'copy': '.runtime/firestore.rules',
        'sha256': hashlib.sha256(rules).hexdigest(),
    }, indent=2) + '\n')
    env = {k: v for k, v in os.environ.items() if k in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER', 'LOGNAME', 'SHELL']}
    java = runtime / 'jdk-21.0.12.1+1-jre/Contents/Home'
    env.update({
        'JAVA_HOME': str(java), 'PATH': str(java / 'bin') + ':' + env['PATH'],
        'JAVA_TOOL_OPTIONS': '-Xmx512m -XX:ActiveProcessorCount=2',
        'CI': 'true', 'FIREBASE_CLI_DISABLE_USAGE_TRACKING': 'true',
    })
    command = [
        'node', str(runtime / 'node_modules/firebase-tools/lib/bin/firebase.js'),
        'emulators:exec', '--only', 'auth,firestore', '--project', 'demo-espresso-acceptance',
        '--config', str(evidence / 'emulator-config.json'),
        shlex.join(['node', f'docs/qa/espresso-implementation/{suite}.mjs', *arguments]),
    ]
    index = 1
    while (evidence / f'{suite}-{index:02}.log').exists():
        index += 1
    before = source_manifest()
    old_receipts = set(evidence.glob('*-receipt.json'))
    with (evidence / f'{suite}-{index:02}.log').open('w') as log:
        process = subprocess.Popen(command, env=env, cwd=root, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            result = process.wait(timeout=480 if suite in ['live-espresso', 'emulator-app-browser'] else 110)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
            result = 124
    after = source_manifest()
    receipts = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted(set(evidence.glob('*-receipt.json')) - old_receipts)}
    manifest = {'suite': suite, 'arguments': arguments, 'log': f'{suite}-{index:02}.log', 'exitCode': result,
                'cpuIdlePercent': float(idle[1]), 'before': before, 'after': after,
                'sourceStable': before == after, 'receipts': receipts,
                'runtime': {'node': subprocess.check_output(['node', '--version'], text=True).strip(),
                            'browser': 'installed Google Chrome in isolated Playwright context' if suite.endswith('browser') else None}}
    (evidence / f'{suite}-{index:02}-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if before != after:
        result = 1
    print(f'{suite} exit {result}; CPU idle {idle[1]}%; log {suite}-{index:02}.log')
finally:
    if (lock / 'owner').read_text().strip() == owner:
        (lock / 'owner').unlink()
        lock.rmdir()
sys.exit(result)
