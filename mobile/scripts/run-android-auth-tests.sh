#!/usr/bin/env bash
# Runs inside the emulator action while its ephemeral device is alive.
set -euo pipefail
root="${CM_BUILD_DIR:?CM_BUILD_DIR must identify the checkout}"
evidence="$root/android-emulator-evidence"
adb_tool="$ANDROID_HOME/platform-tools/adb"
serial="${ANDROID_SERIAL:-emulator-5554}"
mkdir -p "$evidence"
# Only current-run output may satisfy acceptance checks.
python3 - "$evidence" "$root/mobile/android/app/build/outputs/androidTest-results" <<'PY'
from pathlib import Path
import shutil, sys
evidence, reports = map(Path, sys.argv[1:])
for name in ('auth-entry', 'auth-entry.tar', 'summary.json'):
    item = evidence / name
    if item.is_dir():
        shutil.rmtree(item)
    elif item.exists():
        item.unlink()
for report in reports.rglob('TEST-*.xml'):
    report.unlink()
PY
# A clean emulator may not have the debug app installed yet.
timeout 15 "$adb_tool" -s "$serial" shell run-as com.proproster.app rm -rf files/auth-test-evidence >/dev/null 2>&1 || true
collect_evidence() {
  result=$?
  trap - EXIT
  set +e
  if [ -n "${logcat_pid:-}" ]; then kill "$logcat_pid" 2>/dev/null; wait "$logcat_pid" 2>/dev/null; fi
  timeout 15 "$adb_tool" -s "$serial" logcat -b crash -d > "$evidence/crash.log" 2>&1
  timeout 15 "$adb_tool" -s "$serial" logcat -d -s chromium Capacitor > "$evidence/webview.log" 2>&1
  timeout 15 "$adb_tool" -s "$serial" shell dumpsys activity activities > "$evidence/activity.txt" 2>&1
  timeout 15 "$adb_tool" -s "$serial" exec-out run-as com.proproster.app tar -C files -cf - auth-test-evidence > "$evidence/auth-entry.tar" 2> "$evidence/collection.log"
  python3 - "$evidence" "$result" <<'PY'
import json, sys, tarfile
from pathlib import Path
folder = Path(sys.argv[1])
status = int(sys.argv[2])
try:
    with tarfile.open(folder / 'auth-entry.tar') as archive:
        archive.extractall(folder / 'auth-entry', filter='data')
except (tarfile.TarError, OSError) as error:
    (folder / 'collection-error.txt').write_text(str(error))
required = ['login-entry.png', 'password-reset-entry.png', 'signup-entry.png', 'auth-returned-to-landing.png']
missing = [name for name in required if not list((folder / 'auth-entry').rglob(name))]
if status == 0 and missing:
    status = 1
(folder / 'summary.json').write_text(json.dumps({
    'status': 'passed' if status == 0 else 'failed',
    'test_exit_code': int(sys.argv[2]),
    'missing_screenshots': missing,
    'scope': 'Native login/reset/signup entry navigation only. No credentials, account activation, reset email, or uploads submitted.'
}, indent=2) + '\n')
sys.exit(status)
PY
  evidence_result=$?
  if [ "$result" -eq 0 ] && [ "$evidence_result" -ne 0 ]; then result=$evidence_result; fi
  exit "$result"
}
trap collect_evidence EXIT
# Preserve logs even if the virtual device disappears before the EXIT trap.
"$adb_tool" -s "$serial" logcat -v threadtime > "$evidence/live-logcat.log" 2>&1 &
logcat_pid=$!
cd "$root/mobile/android"
timeout --kill-after=10s 300s bash ./gradlew --no-daemon :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.proproster.app.AuthEntryTest --stacktrace 2>&1 | tee "$evidence/auth-gradle.log"
python3 - "$root/mobile/android/app/build/outputs/androidTest-results" <<'PY'
from pathlib import Path
import sys, xml.etree.ElementTree as ET
reports = list(Path(sys.argv[1]).rglob('TEST-*.xml'))
if not reports:
    raise SystemExit('No native Android JUnit report produced.')
tests = failures = errors = skipped = 0
for report in reports:
    suite = ET.parse(report).getroot()
    tests += int(suite.get('tests', 0))
    failures += int(suite.get('failures', 0))
    errors += int(suite.get('errors', 0))
    skipped += int(suite.get('skipped', 0))
if tests != 1 or failures or errors or skipped:
    raise SystemExit(f'Expected one passing native test: {tests=}, {failures=}, {errors=}, {skipped=}')
print('One native Android auth-entry test passed.')
PY
