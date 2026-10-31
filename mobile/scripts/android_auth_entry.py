"""Unauthenticated auth-entry checks using Android's accessibility hierarchy."""
import re
import time
import xml.etree.ElementTree as ET


def bounds_center(value):
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', value)
    if not match:
        raise ValueError('Missing or invalid accessibility bounds.')
    left, top, right, bottom = map(int, match.groups())
    if right <= left or bottom <= top:
        raise ValueError('Accessibility target has no visible area.')
    return ((left + right) // 2, (top + bottom) // 2)


def find_node(tree, label, clickable=False):
    parents = {child: parent for parent in tree.iter() for child in parent}
    for node in tree.iter('node'):
        if label not in (node.get('text'), node.get('content-desc')):
            continue
        target = node
        if clickable:
            while target.get('clickable') != 'true' and target in parents:
                target = parents[target]
            if target.get('clickable') != 'true':
                continue
        if target.get('enabled') == 'false':
            continue
        try:
            bounds_center(target.get('bounds', ''))
        except ValueError:
            continue
        return target
    return None


def run_auth_checks(device, evidence):
    sequence = 0

    def hierarchy():
        nonlocal sequence
        sequence += 1
        device('shell', 'uiautomator', 'dump', '/sdcard/proproster-ui.xml')
        xml = device('exec-out', 'cat', '/sdcard/proproster-ui.xml').stdout
        (evidence / f'auth-hierarchy-{sequence:02d}.xml').write_bytes(xml)
        return ET.fromstring(xml)

    def wait_for(label, clickable=False):
        deadline = time.monotonic() + 30
        while True:
            node = find_node(hierarchy(), label, clickable)
            if node is not None:
                return node
            if time.monotonic() >= deadline:
                raise AssertionError(f'Android accessibility element not found: {label}')
            time.sleep(1)

    def tap(label):
        node = wait_for(label, clickable=True)
        x, y = bounds_center(node.get('bounds'))
        device('shell', 'input', 'tap', str(x), str(y))

    def capture(name):
        png = device('exec-out', 'screencap', '-p').stdout
        if not png.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError('Auth capture did not return a PNG.')
        (evidence / f'{name}.png').write_bytes(png)

    tap('Log In')
    wait_for('Sign in to PropRoster')
    wait_for('Enter your email')
    capture('login-entry')
    tap('Forgot password?')
    wait_for('Reset your password')
    capture('password-reset-entry')
    tap('Back to sign in')
    wait_for('Sign in to PropRoster')
    tap('Close')
    tap('Start Free')
    wait_for('Create your PropRoster account')
    wait_for('I manage properties')
    capture('signup-entry')
    tap('Close')
    wait_for('Log In', clickable=True)
    capture('auth-returned-to-landing')
    return ['login entry opened', 'reset entry opened and returned',
            'signup role choice opened', 'dialogs closed to landing']
