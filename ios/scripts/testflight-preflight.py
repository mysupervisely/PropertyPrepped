#!/usr/bin/env python3
"""Fail clearly for missing setup without printing any credential values."""
import os
from pathlib import Path
import re
import sys

required = [
    'APP_STORE_CONNECT_PRIVATE_KEY',
    'APP_STORE_CONNECT_KEY_IDENTIFIER',
    'APP_STORE_CONNECT_ISSUER_ID',
    'BUILD_NUMBER',
    'XCODE_PROJECT',
    'XCODE_SCHEME',
]
errors = [f'Missing configuration: {key}' for key in required if not os.environ.get(key, '').strip()]
number = os.environ.get('BUILD_NUMBER', '')
if number and not re.fullmatch(r'[1-9][0-9]*', number):
    errors.append('BUILD_NUMBER must be a positive integer.')
project = os.environ.get('XCODE_PROJECT')
if project and not Path(project).is_dir():
    errors.append('Configured Xcode project does not exist.')
if errors:
    print('TestFlight setup is incomplete. No archive or upload attempted.')
    for error in errors:
        print(error)
    sys.exit(1)
print('Required configuration is present. Signing files, account approval, API access,')
print('App Store Connect app record, and build number uniqueness still require Apple/Codemagic validation.')
