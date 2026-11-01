"""Verify independent checks still run and failures cannot become success."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location(
    'checks', Path(__file__).with_name('run-simulator-checks.py'))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class SimulatorChecksTest(unittest.TestCase):
    def verify(self, outcomes, expected):
        with patch.object(checks.subprocess, 'run', side_effect=outcomes) as run:
            self.assertEqual(checks.main(), expected)
            self.assertEqual(run.call_count, 2)
            self.assertTrue(run.call_args_list[0].args[0][1].endswith('offline-smoke.py'))
            self.assertTrue(run.call_args_list[1].args[0][1].endswith('run-ui-tests.py'))

    def test_both_pass(self):
        self.verify([Mock(returncode=0), Mock(returncode=0)], 0)

    def test_recovery_failure_does_not_skip_auth_or_pass_build(self):
        self.verify([Mock(returncode=1), Mock(returncode=0)], 1)

    def test_auth_failure_fails_build(self):
        self.verify([Mock(returncode=0), Mock(returncode=65)], 1)

    def test_recovery_timeout_still_runs_auth(self):
        self.verify([subprocess.TimeoutExpired('offline', 1200), Mock(returncode=0)], 1)

    def test_launch_error_still_runs_auth(self):
        self.verify([OSError('launch failed'), Mock(returncode=0)], 1)


if __name__ == '__main__':
    unittest.main()
