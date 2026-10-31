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
import socket
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
    recovery = copied / 'public' / 'connection-error.html'
    if not recovery.is_file() or 'Try again' not in recovery.read_text():
        raise RuntimeError('Bundled recovery HTML is missing or incomplete.')

    def stop():
        # XCTest may already have stopped the app.
        subprocess.run(['xcrun', 'simctl', 'terminate', udid, 'com.proproster.app'],
                       capture_output=True, timeout=30)

    def capture(name, delays):
        stop()
        config_file.write_text(json.dumps(config))
        run('xcrun', 'simctl', 'install', udid, str(copied))
        with (evidence / f'{name}-console.log').open('w') as log:
            process = subprocess.Popen(
                ['xcrun', 'simctl', 'launch', '--console', udid, 'com.proproster.app'],
                stdout=log, stderr=subprocess.STDOUT)
            try:
                elapsed = 0
                for delay in delays:
                    time.sleep(delay - elapsed)
                    elapsed = delay
                    if process.poll() not in (None, 0):
                        raise RuntimeError(f'{name} launch failed; inspect console log.')
                    run('xcrun', 'simctl', 'io', udid, 'screenshot',
                        str(evidence / f'{name}-{delay}s.png'))
            finally:
                stop()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)

    try:
        # First isolate local asset rendering from navigation-failure handling.
        config['server'].pop('url', None)
        config['server']['appStartPath'] = 'connection-error.html'
        capture('recovery-local-asset', [10])
        config['server'].pop('appStartPath', None)
        # Reserve a normal ephemeral port without listening. Port 1 is restricted
        # by WebKit and does not represent an ordinary connection failure.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as closed_port:
            closed_port.bind(('127.0.0.1', 0))
            port = closed_port.getsockname()[1]
            config['server']['url'] = f'https://127.0.0.1:{port}'
            capture('offline-recovery', [10, 30])
        shutil.copyfile(evidence / 'offline-recovery-30s.png',
                        evidence / 'offline-recovery.png')
        (evidence / 'offline-scope.txt').write_text(
            'Isolated unsigned simulator copies; production config unchanged.\n'
            'recovery-local-asset-10s.png loads the bundled page directly.\n'
            'offline-recovery-10s.png and -30s.png test a refused loopback HTTPS connection.\n'
            'Console logs accompany both scenarios. Inspect screenshots; no UI or retry assertion.\n')
    finally:
        stop()
        run('xcrun', 'simctl', 'install', udid, str(original))
