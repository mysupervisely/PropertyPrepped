"""Exercise package rejection rules with synthetic APK ZIP fixtures, not Android builds."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('verify_apk', Path(__file__).with_name('verify-debug-apk.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        page = self.root / 'mobile/www/connection-error.html'
        page.parent.mkdir(parents=True)
        page.write_text('<a href="https://proproster.com">Try again</a>')
        self.config = {'appId': 'com.proproster.app', 'appName': 'PropRoster',
                       'server': {'url': 'https://proproster.com', 'errorPath': 'connection-error.html'}}
        self.entries = {'AndroidManifest.xml': b'fixture', 'classes.dex': b'fixture',
                        'res/mipmap-mdpi-v4/ic_launcher.png': b'fixture',
                        'assets/public/connection-error.html': page.read_bytes()}

    def inspect(self):
        apk = self.root / 'app-debug.apk'
        with zipfile.ZipFile(apk, 'w') as archive:
            for name, content in self.entries.items():
                archive.writestr(name, content)
            archive.writestr('assets/capacitor.config.json', json.dumps(self.config))
        return verify.inspect_apk(apk, self.root)

    def test_valid_fixture_has_checksum_and_limited_scope(self):
        report = self.inspect()
        self.assertEqual(len(report['sha256']), 64)
        self.assertIn('no device', report['scope'])

    def test_rejects_localhost_and_http(self):
        for url in ('https://localhost:3000', 'http://proproster.com'):
            with self.subTest(url=url):
                self.config['server']['url'] = url
                with self.assertRaisesRegex(ValueError, 'fixed production'):
                    self.inspect()

    def test_rejects_diagnostic_launch_and_navigation_overrides(self):
        for key, value in (('appStartPath', 'connection-error.html'), ('cleartext', True),
                           ('allowNavigation', ['*'])):
            with self.subTest(key=key):
                self.config['server'][key] = value
                with self.assertRaises(ValueError):
                    self.inspect()
                del self.config['server'][key]

    def test_rejects_wrong_identity(self):
        self.config['appId'] = 'com.example.app'
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.inspect()

    def test_rejects_stale_recovery_page(self):
        self.entries['assets/public/connection-error.html'] = b'stale'
        with self.assertRaisesRegex(ValueError, 'differs'):
            self.inspect()

    def test_rejects_missing_dex_and_icons(self):
        for name in ('classes.dex', 'res/mipmap-mdpi-v4/ic_launcher.png'):
            with self.subTest(name=name):
                value = self.entries.pop(name)
                with self.assertRaises(ValueError):
                    self.inspect()
                self.entries[name] = value


if __name__ == '__main__':
    unittest.main()
