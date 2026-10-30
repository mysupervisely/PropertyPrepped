#!/usr/bin/env python3
"""Install/launch the unsigned build and capture evidence on a cloud Mac.

Screenshots require human inspection. Success here does not mean the hosted
page loaded, authentication worked, or user workflows passed.
"""
import json
import os
from pathlib import Path
import subprocess
import time


def run(*args, timeout=60):
    result = subprocess.run(args, check=True, text=True, capture_output=True, timeout=timeout)
    return result.stdout.strip()


def main():
    root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
    artifacts = root / 'ios-simulator-evidence'
    artifacts.mkdir(exist_ok=True)
    app = root / 'ios-simulator-derived/Build/Products/Debug-iphonesimulator/App.app'
    if not app.is_dir():
        raise RuntimeError(f'Unsigned simulator app missing: {app}')

    raw = run('xcrun', 'simctl', 'list', 'devices', 'available', '--json')
    (artifacts / 'available-devices.json').write_text(raw)
    devices = json.loads(raw)['devices']
    candidates = [(runtime, device) for runtime, group in devices.items()
                  if '.iOS-' in runtime for device in group
                  if device.get('isAvailable') and device['name'].startswith('iPhone')]
    if not candidates:
        raise RuntimeError('No available iPhone simulator; install an iOS runtime in the cloud image.')
    # Prefer a booted iPhone, then the newest available iOS runtime.
    runtime, device = sorted(candidates, key=lambda item: (
        item[1]['state'] == 'Booted',
        tuple(int(part) for part in item[0].split('.iOS-')[-1].split('-')),
        item[1]['name']), reverse=True)[0]
    udid = device['udid']
    report = {'device': device['name'], 'runtime': runtime, 'udid': udid,
              'scope': 'Install, launch and screenshot evidence only; manual inspection required.'}
    try:
        if device['state'] != 'Booted':
            run('xcrun', 'simctl', 'boot', udid)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b', timeout=180)
        run('xcrun', 'simctl', 'install', udid, str(app))
        report['launch'] = run('xcrun', 'simctl', 'launch', udid, 'com.proproster.app')
        (artifacts / 'launch.txt').write_text(report['launch'] + '\n')
        for delay, name in [(15, 'launch-15s.png'), (15, 'launch-30s.png')]:
            time.sleep(delay)
            run('xcrun', 'simctl', 'io', udid, 'screenshot', str(artifacts / name))
        report['result'] = 'Evidence captured. Inspect screenshots; no UI assertions performed.'
    except Exception as error:
        report['result'] = 'Failed'
        report['error'] = str(error)
        raise
    finally:
        (artifacts / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    print(report['result'])


if __name__ == '__main__':
    main()
