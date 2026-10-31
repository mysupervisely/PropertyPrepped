#!/usr/bin/env python3
"""Check a built debug APK's bundled configuration and recovery HTML.

This inspects packaging only. It does not launch Android or verify signing,
authentication, visual appearance, uploads, or Google Play readiness.
"""
import hashlib
import json
import os
from pathlib import Path
import zipfile


def inspect_apk(apk, root):
    with zipfile.ZipFile(apk) as archive:
        broken = archive.testzip()
        if broken:
            raise ValueError(f'Corrupt APK entry: {broken}')
        names = set(archive.namelist())
        for required in ('AndroidManifest.xml', 'classes.dex', 'assets/capacitor.config.json'):
            if required not in names:
                raise ValueError(f'Missing APK entry: {required}')
        config = json.loads(archive.read('assets/capacitor.config.json'))
        server = config.get('server', {})
        if config.get('appId') != 'com.proproster.app':
            raise ValueError('Unexpected Capacitor application identity.')
        if config.get('appName') != 'PropRoster':
            raise ValueError('Unexpected app display name in Capacitor configuration.')
        if server.get('url') != 'https://proproster.com':
            raise ValueError('APK must use the fixed production HTTPS URL.')
        if server.get('errorPath') != 'connection-error.html':
            raise ValueError('APK is missing the configured recovery page.')
        if server.get('cleartext') or server.get('allowNavigation'):
            raise ValueError('Unexpected cleartext or navigation allowlist override.')
        if server.get('appStartPath'):
            raise ValueError('Diagnostic appStartPath must not ship in the APK.')
        recovery = archive.read('assets/public/connection-error.html')
        if recovery != (root / 'mobile/www/connection-error.html').read_bytes():
            raise ValueError('Packaged recovery HTML differs from the reviewed source.')
        icons = sorted(name for name in names
                       if name.startswith('res/mipmap') and 'ic_launcher' in name)
        if not icons:
            raise ValueError('No launcher icon resources found in APK.')
    return {
        'apk': apk.name,
        'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
        'bytes': apk.stat().st_size,
        'checks': ['ZIP integrity', 'required Android entries', 'Capacitor app identity',
                   'fixed HTTPS URL', 'recovery configuration and exact HTML',
                   'no diagnostic start path', 'launcher resource presence'],
        'launcher_resources': icons,
        'scope': 'Packaging only; no device, signing, visual, login, upload, or store verification.',
    }


def main():
    root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
    evidence = root / 'android-build-evidence'
    evidence.mkdir(exist_ok=True)
    report = evidence / 'apk-packaging.json'
    report.unlink(missing_ok=True)
    apks = sorted((root / 'mobile/android/app/build/outputs/apk/debug').glob('*.apk'))
    if len(apks) != 1:
        raise ValueError(f'Expected one debug APK, found {len(apks)}.')
    try:
        result = inspect_apk(apks[0], root)
    except Exception as error:
        report.write_text(json.dumps({'status': 'failed', 'error': str(error)}, indent=2))
        raise
    result['status'] = 'passed'
    report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
