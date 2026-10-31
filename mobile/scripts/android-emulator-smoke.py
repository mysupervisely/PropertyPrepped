#!/usr/bin/env python3
"""Install and launch the debug APK on an ephemeral Codemagic Linux emulator.

Screenshots require inspection. No account creation, login, or uploads occur.
"""
import json
import io
import tarfile
import os
from pathlib import Path
import subprocess
import time


def select_avd(names):
    for name in ('emulator-36', 'emulator-35'):
        if name in names:
            return name
    raise RuntimeError('Expected Android API 35 or 36 AVD is unavailable; inspect available-avds.txt.')


def main():
    root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
    evidence = root / 'android-emulator-evidence'
    evidence.mkdir(exist_ok=True)
    sdk = Path(os.environ['ANDROID_SDK_ROOT'])
    emulator = str(sdk / 'emulator/emulator')
    adb = str(sdk / 'platform-tools/adb')
    serial = 'emulator-5554'
    package = 'com.proproster.app'
    apk = root / 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
    if not apk.is_file():
        raise RuntimeError('Expected verified debug APK is missing.')

    def run(*args, check=True, timeout=60):
        try:
            return subprocess.run(args, check=check, capture_output=True, timeout=timeout)
        except subprocess.CalledProcessError as error:
            (evidence / 'command-failure.txt').write_text(
                ' '.join(args) + '\n' + (error.stdout or b'').decode(errors='replace')
                + (error.stderr or b'').decode(errors='replace'))
            raise

    def device(*args, check=True, timeout=60):
        return run(adb, '-s', serial, *args, check=check, timeout=timeout)

    available = run(emulator, '-list-avds').stdout.decode()
    (evidence / 'available-avds.txt').write_text(available)
    avd = select_avd([name.strip() for name in available.splitlines()])
    summary = {'avd': avd, 'package': package, 'status': 'failed',
               'scope': 'Install, foreground launch, and screenshot capture only. No authenticated flow or visual assertion.'}
    with (evidence / 'emulator.log').open('wb') as log:
        process = subprocess.Popen([emulator, '-avd', avd, '-port', '5554',
                                    '-no-window', '-no-audio', '-no-snapshot',
                                    '-wipe-data', '-no-boot-anim', '-gpu', 'swiftshader',
                                    '-feature', '-Vulkan', '-cores', '2'],
                                   stdout=log, stderr=subprocess.STDOUT)
        try:
            run(adb, 'start-server')
            deadline = time.monotonic() + 240
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Emulator exited before boot; inspect emulator.log.')
                boot = device('shell', 'getprop', 'sys.boot_completed', check=False)
                if boot.returncode == 0 and boot.stdout.strip() == b'1':
                    break
                if time.monotonic() >= deadline:
                    raise TimeoutError('Emulator boot exceeded 240 seconds.')
                time.sleep(2)
            device('shell', 'input', 'keyevent', '82')
            installed = device('install', '-r', str(apk))
            (evidence / 'install.txt').write_bytes(installed.stdout + installed.stderr)
            device('logcat', '-c')
            launch = device('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity')
            (evidence / 'launch.txt').write_bytes(launch.stdout + launch.stderr)
            if b'Error:' in launch.stdout + launch.stderr:
                raise RuntimeError('Activity launch reported an error.')
            for delay in (10, 20):
                time.sleep(delay)
                elapsed = 10 if delay == 10 else 30
                screenshot = device('exec-out', 'screencap', '-p').stdout
                if not screenshot.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise RuntimeError('Emulator did not return a PNG screenshot.')
                (evidence / f'app-{elapsed}s.png').write_bytes(screenshot)
            device('shell', 'pidof', package)
            activity = device('shell', 'dumpsys', 'activity', 'activities').stdout
            (evidence / 'activity.txt').write_bytes(activity)
            resumed = [line for line in activity.decode(errors='replace').splitlines()
                       if 'mResumedActivity' in line or 'topResumedActivity' in line]
            if not any(package + '/' in line for line in resumed):
                raise RuntimeError('PropRoster is not the foreground activity after capture.')
            test_apk = root / 'mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
            if not test_apk.is_file():
                raise RuntimeError('Android instrumentation APK is missing.')
            device('install', '-r', str(test_apk))
            try:
                tested = device('shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                                'com.proproster.app.AuthEntryTest',
                                'com.proproster.app.test/androidx.test.runner.AndroidJUnitRunner',
                                check=False, timeout=300)
                output = tested.stdout + tested.stderr
                (evidence / 'auth-instrumentation.log').write_bytes(output)
                if tested.returncode or b'OK (1 test)' not in output:
                    raise AssertionError('Android auth instrumentation failed; inspect log and screenshots.')
            finally:
                collected = device('exec-out', 'run-as', package, 'tar', '-C', 'files',
                                   '-cf', '-', 'auth-test-evidence', check=False, timeout=30)
                if collected.returncode == 0 and collected.stdout:
                    with tarfile.open(fileobj=io.BytesIO(collected.stdout)) as archive:
                        archive.extractall(evidence / 'auth-entry', filter='data')
                else:
                    (evidence / 'auth-evidence-collection.log').write_bytes(collected.stderr)
            summary['auth_entry_checks'] = ['login opened', 'reset opened and returned',
                                            'signup role choice opened', 'dialogs closed to landing']
            summary['scope'] = 'Install, foreground launch, auth-entry navigation assertions, and screenshots. No credentials, account creation, reset email, or uploads submitted.'
            summary['status'] = 'captured'
        except Exception as error:
            summary['error'] = str(error)
            summary['emulator_returncode_at_failure'] = process.poll()
            raise
        finally:
            # Diagnostics must not prevent shutdown or replace the original error.
            try:
                crash = device('logcat', '-b', 'crash', '-d', check=False, timeout=10)
                (evidence / 'crash.log').write_bytes(crash.stdout + crash.stderr)
            except (OSError, subprocess.SubprocessError):
                pass
            try:
                web = device('logcat', '-d', '-s', 'chromium', 'Capacitor', check=False, timeout=10)
                (evidence / 'webview.log').write_bytes(web.stdout + web.stderr)
            except (OSError, subprocess.SubprocessError):
                pass
            (evidence / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
