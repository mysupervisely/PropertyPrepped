#!/usr/bin/env python3
"""Capture offline recovery using an isolated unsigned simulator app copy.

Never modifies the repository config or the normal build artifact. The copy
uses a closed loopback port to trigger native navigation failure. Screenshots
require inspection; this is not an automated assertion of the recovery UI.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
evidence = root / 'ios-simulator-evidence'
udid = json.loads((evidence / 'summary.json').read_text())['udid']
original = root / 'ios-simulator-derived/Build/Products/Debug-iphonesimulator/App.app'

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=60)

with tempfile.TemporaryDirectory(prefix='proproster-offline-') as directory:
    copied = Path(directory) / 'App.app'
    shutil.copytree(original, copied)
    config_file = copied / 'capacitor.config.json'
    config = json.loads(config_file.read_text())
    if config.get('server', {}).get('errorPath') != 'connection-error.html':
        raise RuntimeError('Recovery page must be configured before offline capture.')
    config['server']['url'] = 'https://127.0.0.1:1'
    config_file.write_text(json.dumps(config))
    try:
        # The app may already be stopped after XCTest; terminate is best effort.
        subprocess.run(['xcrun', 'simctl', 'terminate', udid, 'com.proproster.app'],
                       capture_output=True, timeout=30)
        run('xcrun', 'simctl', 'install', udid, str(copied))
        run('xcrun', 'simctl', 'launch', udid, 'com.proproster.app')
        time.sleep(10)
        run('xcrun', 'simctl', 'io', udid, 'screenshot', str(evidence / 'offline-recovery.png'))
        (evidence / 'offline-scope.txt').write_text(
            'Isolated simulator copy pointed at closed loopback HTTPS port.\n'
            'Inspect offline-recovery.png. No UI assertion or retry interaction performed.\n')
    finally:
        subprocess.run(['xcrun', 'simctl', 'terminate', udid, 'com.proproster.app'],
                       capture_output=True, timeout=30)
        run('xcrun', 'simctl', 'install', udid, str(original))
