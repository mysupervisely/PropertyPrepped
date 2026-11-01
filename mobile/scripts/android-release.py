#!/usr/bin/env python3
"""Prepare and verify an upload-key-signed AAB. Never publishes to Google Play."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile


def fingerprint(value):
    value = value.replace(':', '').strip().upper()
    if not re.fullmatch(r'[0-9A-F]{64}', value):
        raise ValueError('Set PROPROSTER_UPLOAD_CERT_SHA256 to the backed-up upload key certificate SHA-256 (first upload), or the registered upload certificate from Play Console (updates).')
    return value


def versions(env):
    code = env.get('PROPROSTER_VERSION_CODE', '')
    previous = env.get('PLAY_MAX_VERSION_CODE', '')
    if not re.fullmatch(r'[1-9][0-9]*', code) or int(code) > 2100000000:
        raise ValueError('Set a positive PROPROSTER_VERSION_CODE, at most 2100000000.')
    if not re.fullmatch(r'0|[1-9][0-9]*', previous) or int(code) <= int(previous):
        raise ValueError('PLAY_MAX_VERSION_CODE must be the highest used Play version (0 for no uploads); the new code must be higher.')
    return int(code)


def command(args):
    result = subprocess.run(args, capture_output=True, timeout=120)
    if result.returncode:
        # Tool output can contain paths or aliases. Keep errors generic.
        raise ValueError('Signing tool failed. Check the configured key and credentials in Codemagic.')
    return result.stdout


def preflight(env):
    code = versions(env)
    expected = fingerprint(env.get('PROPROSTER_UPLOAD_CERT_SHA256', ''))
    required = ['CM_KEYSTORE_PATH', 'CM_KEYSTORE_PASSWORD', 'CM_KEY_ALIAS', 'CM_KEY_PASSWORD']
    if any(not env.get(name) for name in required):
        raise ValueError('Configure the proproster_upload keystore in Codemagic Code signing identities.')
    if not Path(env['CM_KEYSTORE_PATH']).is_file():
        raise ValueError('Configured keystore file is unavailable.')
    cert = command(['keytool', '-exportcert', '-keystore', env['CM_KEYSTORE_PATH'],
                    '-alias', env['CM_KEY_ALIAS'], '-storepass:env', 'CM_KEYSTORE_PASSWORD'])
    if hashlib.sha256(cert).hexdigest().upper() != expected:
        raise ValueError('Upload certificate does not match PROPROSTER_UPLOAD_CERT_SHA256. Do not replace the existing key.')
    return code, expected


def inspect_bundle(path, root):
    with zipfile.ZipFile(path) as archive:
        if archive.testzip():
            raise ValueError('Corrupt bundle ZIP.')
        for name in ['BundleConfig.pb', 'base/manifest/AndroidManifest.xml', 'base/dex/classes.dex']:
            if name not in archive.namelist():
                raise ValueError('Required bundle entry missing: ' + name)
        config = json.loads(archive.read('base/assets/capacitor.config.json'))
        server = config.get('server', {})
        if config.get('appId') != 'com.proproster.app' or config.get('appName') != 'PropRoster':
            raise ValueError('Wrong bundled app identity.')
        if server.get('url') != 'https://proproster.com' or server.get('errorPath') != 'connection-error.html':
            raise ValueError('Wrong production URL or recovery configuration.')
        if any(server.get(key) for key in ['cleartext', 'allowNavigation', 'appStartPath']):
            raise ValueError('Diagnostic or navigation override must not ship.')
        if config.get('android', {}).get('minWebViewVersion') != 111:
            raise ValueError('Missing WebView baseline.')
        if archive.read('base/assets/public/connection-error.html') != (root / 'mobile/www/connection-error.html').read_bytes():
            raise ValueError('Recovery HTML differs from source.')
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_signature(path, expected):
    output = command(['jarsigner', '-J-Duser.language=en', '-verify', str(path)]).decode()
    if 'jar verified.' not in output or 'unsigned entries' in output.lower():
        raise ValueError('Bundle signature missing or incomplete.')
    certs = command(['keytool', '-printcert', '-rfc', '-jarfile', str(path)]).decode()
    blocks = re.findall(r'-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----', certs, re.S)
    if len(blocks) != 1 or hashlib.sha256(base64.b64decode(blocks[0])).hexdigest().upper() != expected:
        raise ValueError('Bundle must have exactly the expected upload certificate.')


def main():
    root = Path(os.environ.get('CM_BUILD_DIR', Path(__file__).resolve().parents[2]))
    if sys.argv[1:] == ['preflight']:
        preflight(os.environ)
        print('Upload certificate and version configuration verified. No Play upload performed.')
        return
    validation = sys.argv[1:] == ['unsigned-validation']
    if not validation and sys.argv[1:] != ['verify']:
        raise ValueError('Use preflight, verify, or unsigned-validation.')
    bundles = list((root / 'mobile/android/app/build/outputs/bundle/release').glob('*.aab'))
    if len(bundles) != 1:
        raise ValueError('Expected one current release bundle.')
    digest = inspect_bundle(bundles[0], root)
    report = {'sha256': digest, 'bundle': bundles[0].name, 'signed': False,
              'source_commit': os.environ.get('CM_COMMIT', os.environ.get('GITHUB_SHA', 'unknown')),
              'scope': 'Bundle packaging only. No Google Play upload, device or store acceptance.'}
    if not validation:
        code, expected = preflight(os.environ)
        verify_signature(bundles[0], expected)
        report.update(signed=True, version_code=code, upload_cert_sha256=expected)
    evidence = root / 'android-release-evidence'
    evidence.mkdir(exist_ok=True)
    (evidence / 'bundle-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Bundle verified. Signed upload candidate.' if not validation else 'Unsigned bundle packaging verified. Not uploadable to Play.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, subprocess.TimeoutExpired) as error:
        print('Android release check failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
