#!/usr/bin/env python3
"""Run unauthenticated native UI checks using the smoke run's simulator."""
import json
import os
from pathlib import Path
import subprocess

root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
evidence = root / 'ios-simulator-evidence'
summary = json.loads((evidence / 'summary.json').read_text())
command = [
    'xcodebuild', 'test', '-project', str(root / 'mobile/ios/App/App.xcodeproj'),
    '-scheme', 'App', '-configuration', 'Debug',
    '-destination', f"platform=iOS Simulator,id={summary['udid']}",
    '-derivedDataPath', str(root / 'ios-simulator-derived'),
    '-resultBundlePath', str(evidence / 'AuthEntry.xcresult'),
    '-only-testing:AppUITests', '-parallel-testing-enabled', 'NO',
    'CODE_SIGNING_ALLOWED=NO',
]
with (evidence / 'ui-tests.log').open('w') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=900)
# Export ordinary PNG/text attachments for inspection without a local Mac.
# Export failures are reported separately and never mask the actual test result.
if (evidence / 'AuthEntry.xcresult').exists():
    with (evidence / 'attachment-export.log').open('w') as log:
        exported = subprocess.run([
            'xcrun', 'xcresulttool', 'export', 'attachments',
            '--path', str(evidence / 'AuthEntry.xcresult'),
            '--output-path', str(evidence / 'ui-attachments'),
        ], stdout=log, stderr=subprocess.STDOUT, timeout=120)
    if exported.returncode:
        print('Attachment export failed; original xcresult and export log preserved.')
print((evidence / 'ui-tests.log').read_text()[-12000:])
raise SystemExit(result.returncode)
