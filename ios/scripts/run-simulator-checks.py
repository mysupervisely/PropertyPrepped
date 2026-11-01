#!/usr/bin/env python3
"""Collect recovery diagnostics and auth tests, preserving either failure."""
from pathlib import Path
import subprocess
import sys


def main():
    scripts = Path(__file__).resolve().parent
    failures = []
    for name in ('offline-smoke.py', 'run-ui-tests.py'):
        print(f'Running {name}', flush=True)
        try:
            result = subprocess.run([sys.executable, str(scripts / name)], timeout=1200)
            if result.returncode:
                failures.append((name, result.returncode))
        except (subprocess.TimeoutExpired, OSError) as error:
            print(f'{name} could not complete: {error}', flush=True)
            failures.append((name, 1))
    for name, code in failures:
        print(f'FAILED: {name} (exit {code})', flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
