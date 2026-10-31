"""Regression-test runner exit/evidence handling using fake SDK and Gradle tools."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

RUNNER = Path(__file__).with_name('run-android-auth-tests.sh').resolve()


class AuthRunnerExitTests(unittest.TestCase):
    def scenario(self, gradle_exit=0, report=True, screenshots=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            android = root / 'mobile/android'
            android.mkdir(parents=True)
            (android / 'gradlew').write_text(f'#!/bin/bash\nexit {gradle_exit}\n')
            reports = android / 'app/build/outputs/androidTest-results/connected/debug'
            reports.mkdir(parents=True)
            if report:
                (reports / 'TEST-fixture.xml').write_text('<testsuite tests="1" failures="0" errors="0" skipped="0"/>')
            adb = root / 'sdk/platform-tools/adb'
            adb.parent.mkdir(parents=True)
            adb.write_text('''#!/usr/bin/env python3
import io, os, sys, tarfile
if 'run-as' in sys.argv:
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
        if os.environ['FAKE_SCREENSHOTS'] == '1':
            for name in ['login-entry', 'password-reset-entry', 'signup-entry', 'auth-returned-to-landing']:
                data = b'fixture PNG'
                member = tarfile.TarInfo('auth-test-evidence/' + name + '.png')
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
''')
            adb.chmod(0o755)
            env = {**os.environ, 'CM_BUILD_DIR': str(root), 'ANDROID_HOME': str(root / 'sdk'),
                   'FAKE_SCREENSHOTS': '1' if screenshots else '0'}
            result = subprocess.run(['bash', str(RUNNER)], env=env, capture_output=True, text=True, timeout=20)
            self.assertTrue((root / 'android-emulator-evidence/summary.json').exists())
            return result.returncode

    def test_success_requires_junit_and_screenshots(self):
        self.assertEqual(self.scenario(), 0)

    def test_preserves_test_failure(self):
        self.assertEqual(self.scenario(gradle_exit=65), 65)

    def test_missing_test_report_cannot_pass(self):
        self.assertNotEqual(self.scenario(report=False), 0)

    def test_missing_screenshots_cannot_pass(self):
        self.assertNotEqual(self.scenario(screenshots=False), 0)


if __name__ == '__main__':
    unittest.main()
