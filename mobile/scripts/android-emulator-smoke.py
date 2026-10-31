#!/usr/bin/env python3
"""Install and launch the debug APK on an ephemeral Codemagic Linux emulator.

Screenshots require inspection. No account creation, login, or uploads occur.
"""
import json
import os
from pathlib import Path
import subprocess
import time

from android_auth_entry import run_auth_checks


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
        return subprocess.run(args, check=check, capture_output=True, timeout=timeout)

    def device(*args, check=True):
        return run(adb, '-s', serial, *args, check=check)

    available = run(emulator, '-list-avds').stdout.decode()
    (evidence / 'available-avds.txt').write_text(available)
    avd = select_avd([name.strip() for name in available.splitlines()])
    summary = {'avd': avd, 'package': package, 'status': 'failed',
               'scope': 'Install, foreground launch, and screenshot capture only. No authenticated flow or visual assertion.'}
    with (evidence / 'emulator.log').open('wb') as log:
        process = subprocess.Popen([emulator, '-avd', avd, '-port', '5554',
                                    '-no-window', '-no-audio', '-no-snapshot',
                                    '-wipe-data', '-no-boot-anim', '-gpu', 'swiftshader_indirect'],
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
            summary['auth_entry_checks'] = run_auth_checks(device, evidence)
            summary['scope'] = 'Install, foreground launch, auth-entry navigation assertions, and screenshots. No credentials, account creation, reset email, or uploads submitted.'
            summary['status'] = 'captured'
        except Exception as error:
            summary['error'] = str(error)
            raise
        finally:
            # Diagnostics must not prevent shutdown or replace the original error.
            try:
                crash = device('logcat', '-b', 'crash', '-d', check=False)
                (evidence / 'crash.log').write_bytes(crash.stdout + crash.stderr)
            except (OSError, subprocess.SubprocessError):
                pass
            try:
                web = device('logcat', '-d', '-s', 'chromium', 'Capacitor', check=False)
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
