"""Regression-test runner exit/evidence handling using fake SDK and Gradle tools."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

RUNNER = Path(__file__).with_name('run-android-auth-tests.sh').resolve()


class AuthRunnerExitTests(unittest.TestCase):
    def scenario(self, gradle_exit=0, report=True, screenshots=True, stale=False, missing_file="", empty=False, remote_error=False):
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
    if os.environ.get('MISSING_FILE') and sys.argv[-1].endswith(os.environ['MISSING_FILE']):
        sys.exit(1)
    if os.environ['FAKE_SCREENSHOTS'] == '1':
        sys.stdout.buffer.write(b'' if os.environ['EMPTY_FILE'] == '1' else b'cat: No such file' if os.environ['REMOTE_ERROR'] == '1' else bytes.fromhex('89504e470d0a1a0a') + b'fixture')
    else:
        sys.exit(1)
''')
            adb.chmod(0o755)
            env = {**os.environ, 'CM_BUILD_DIR': str(root), 'ANDROID_HOME': str(root / 'sdk'),
                   'FAKE_SCREENSHOTS': '1' if screenshots else '0',
                   'MISSING_FILE': missing_file, 'EMPTY_FILE': '1' if empty else '0',
                   'REMOTE_ERROR': '1' if remote_error else '0'}
            result = subprocess.run(['bash', str(RUNNER)], env=env, capture_output=True, text=True, timeout=20)
            self.assertTrue((root / 'android-emulator-evidence/summary.json').exists())
            if missing_file:
                saved = root / 'android-emulator-evidence/auth-entry/auth-test-evidence'
                self.assertTrue((saved / 'auth-final-hierarchy.txt').exists())
                self.assertTrue((saved / 'signup-entry.png').exists())
                self.assertFalse((saved / (missing_file + '.part')).exists())
                summary = json.loads((root / 'android-emulator-evidence/summary.json').read_text())
                self.assertIn(missing_file, summary['missing_screenshots'])
            return result.returncode

    def test_success_requires_junit_and_screenshots(self):
        self.assertEqual(self.scenario(), 0)

    def test_preserves_test_failure(self):
        self.assertEqual(self.scenario(gradle_exit=65), 65)

    def test_missing_test_report_cannot_pass(self):
        self.assertNotEqual(self.scenario(report=False), 0)

    def test_missing_screenshots_cannot_pass(self):
        self.assertNotEqual(self.scenario(screenshots=False), 0)

    def test_failed_file_does_not_hide_other_diagnostics(self):
        self.assertNotEqual(self.scenario(missing_file='password-reset-entry.png'), 0)

    def test_remote_error_text_cannot_count_as_screenshot(self):
        self.assertNotEqual(self.scenario(remote_error=True), 0)

    def test_empty_screenshots_cannot_pass(self):
        self.assertNotEqual(self.scenario(empty=True), 0)

    def test_stale_report_cannot_pass(self):
        self.assertNotEqual(self.scenario(report=False, stale=True), 0)

    def test_stale_screenshots_cannot_pass(self):
        self.assertNotEqual(self.scenario(screenshots=False, stale=True), 0)


if __name__ == '__main__':
    unittest.main()
