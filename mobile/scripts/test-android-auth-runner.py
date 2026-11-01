"""Regression-test runner exit/evidence handling using fake SDK and Gradle tools."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

RUNNER = Path(__file__).with_name('run-android-auth-tests.sh').resolve()


class AuthRunnerExitTests(unittest.TestCase):
    def scenario(self, gradle_exit=0, report=True, screenshots=True, stale=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            android = root / 'mobile/android'
            android.mkdir(parents=True)
            (android / 'gradlew').write_text(f'#!/bin/bash\ncase "$*" in *-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true*) ;; *) exit 97;; esac\nif [ -f pending-report.xml ]; then cp pending-report.xml app/build/outputs/androidTest-results/connected/debug/TEST-fixture.xml; fi\nexit {gradle_exit}\n')
            reports = android / 'app/build/outputs/androidTest-results/connected/debug'
            reports.mkdir(parents=True)
            if report:
                (android / 'pending-report.xml').write_text('<testsuite tests="1" failures="0" errors="0" skipped="0"/>')
            if stale:
                (reports / 'TEST-stale.xml').write_text('<testsuite tests="1" failures="0" errors="0" skipped="0"/>')
                old = root / 'android-emulator-evidence/auth-entry/auth-test-evidence'
                old.mkdir(parents=True)
                for name in ['login-entry', 'password-reset-entry', 'signup-entry', 'auth-returned-to-landing']:
                    (old / (name + '.png')).write_bytes(b'old image')
            adb = root / 'sdk/platform-tools/adb'
            adb.parent.mkdir(parents=True)
            adb.write_text('''#!/usr/bin/env python3
import os, sys
if 'exec-out' in sys.argv:
    if os.environ['FAKE_SCREENSHOTS'] == '1':
        sys.stdout.buffer.write(b'fixture PNG')
    else:
        sys.exit(1)
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

    def test_stale_report_cannot_pass(self):
        self.assertNotEqual(self.scenario(report=False, stale=True), 0)

    def test_stale_screenshots_cannot_pass(self):
        self.assertNotEqual(self.scenario(screenshots=False, stale=True), 0)


if __name__ == '__main__':
    unittest.main()
