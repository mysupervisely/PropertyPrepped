"""Release gate regressions: identity, environment and signing failures stay closed."""
import importlib.util
import json
import hashlib
import shutil
import subprocess
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('android-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_version_must_exceed_every_previous_upload(self):
        for code, previous in [('1', '1'), ('1', '2'), ('0', '0'), ('-1', '0'), ('2147483647', '0'), ('2', '')]:
            with self.subTest(code=code, previous=previous), self.assertRaises(ValueError):
                release.versions({'PROPROSTER_VERSION_CODE': code, 'PLAY_MAX_VERSION_CODE': previous})
        self.assertEqual(release.versions({'PROPROSTER_VERSION_CODE': '2', 'PLAY_MAX_VERSION_CODE': '1'}), 2)

    def test_upload_certificate_format(self):
        self.assertEqual(release.fingerprint(':'.join(['ab'] * 32)), 'AB' * 32)
        with self.assertRaises(ValueError):
            release.fingerprint('not a certificate')

    def test_missing_signing_material_rejected(self):
        with self.assertRaises(ValueError):
            release.preflight({'PROPROSTER_VERSION_CODE': '2', 'PLAY_MAX_VERSION_CODE': '1', 'PROPROSTER_UPLOAD_CERT_SHA256': 'AB' * 32})

    def test_wrong_upload_key_rejected(self):
        with tempfile.NamedTemporaryFile() as key, patch.object(release, 'command', return_value=b'wrong certificate'):
            with self.assertRaises(ValueError):
                release.preflight({'PROPROSTER_VERSION_CODE': '2', 'PLAY_MAX_VERSION_CODE': '1',
                    'PROPROSTER_UPLOAD_CERT_SHA256': 'AB' * 32, 'CM_KEYSTORE_PATH': key.name,
                    'CM_KEYSTORE_PASSWORD': 'fixture', 'CM_KEY_ALIAS': 'fixture', 'CM_KEY_PASSWORD': 'fixture'})

    def test_unsigned_and_partially_signed_bundles_rejected(self):
        for output in [b'jar is unsigned.', b'jar verified. WARNING: unsigned entries found']:
            with self.subTest(output=output), patch.object(release, 'command', return_value=output), self.assertRaises(ValueError):
                release.verify_signature(Path('fixture.aab'), 'AB' * 32)

    @unittest.skipUnless(shutil.which('jarsigner'), 'Full JDK signing tools required; runs in cloud CI')
    def test_actual_signature_and_wrong_certificate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = {**os.environ, 'RELEASE_TEST_PASSWORD': 'temporary-fixture-only'}
            key = root / 'fixture.jks'
            subprocess.run(['keytool', '-genkeypair', '-alias', 'fixture', '-keystore', str(key),
                '-storepass:env', 'RELEASE_TEST_PASSWORD', '-keypass:env', 'RELEASE_TEST_PASSWORD',
                '-dname', 'CN=Temporary CI Test Only', '-keyalg', 'RSA', '-validity', '2'],
                env=env, check=True, capture_output=True)
            bundle = root / 'fixture.aab'
            with zipfile.ZipFile(bundle, 'w') as archive:
                archive.writestr('fixture', b'Not a shipping app')
            subprocess.run(['jarsigner', '-keystore', str(key), '-storepass:env', 'RELEASE_TEST_PASSWORD',
                str(bundle), 'fixture'], env=env, check=True, capture_output=True)
            cert = subprocess.run(['keytool', '-exportcert', '-alias', 'fixture', '-keystore', str(key),
                '-storepass:env', 'RELEASE_TEST_PASSWORD'], env=env, check=True, capture_output=True).stdout
            release.verify_signature(bundle, hashlib.sha256(cert).hexdigest().upper())
            with self.assertRaises(ValueError):
                release.verify_signature(bundle, 'AB' * 32)
            with zipfile.ZipFile(bundle, 'a') as archive:
                archive.writestr('unsigned-injection', b'not signed')
            with self.assertRaises(ValueError):
                release.verify_signature(bundle, hashlib.sha256(cert).hexdigest().upper())

    def fixture(self, root, url='https://proproster.com', identity='com.proproster.app', recovery=b'recovery', dex=True):
        source = root / 'mobile/www/connection-error.html'
        source.parent.mkdir(parents=True)
        source.write_bytes(b'recovery')
        bundle = root / 'fixture.aab'
        config = {'appId': identity, 'appName': 'PropRoster', 'android': {'minWebViewVersion': 111},
                  'server': {'url': url, 'errorPath': 'connection-error.html'}}
        with zipfile.ZipFile(bundle, 'w') as archive:
            for name in ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml'] + (['base/dex/classes.dex'] if dex else []):
                archive.writestr(name, b'fixture')
            archive.writestr('base/assets/capacitor.config.json', json.dumps(config))
            archive.writestr('base/assets/public/connection-error.html', recovery)
        return bundle

    def test_release_bundle_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(len(release.inspect_bundle(self.fixture(root), root)), 64)

    def test_wrong_url_identity_recovery_or_missing_dex_rejected(self):
        for kwargs in [{'url': 'http://localhost:3000'}, {'identity': 'other.app'}, {'recovery': b'stale'}, {'dex': False}]:
            with self.subTest(kwargs=kwargs), tempfile.TemporaryDirectory() as folder, self.assertRaises(ValueError):
                root = Path(folder)
                release.inspect_bundle(self.fixture(root, **kwargs), root)


if __name__ == '__main__':
    unittest.main()
