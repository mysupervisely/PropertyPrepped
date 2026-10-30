import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const config = read('capacitor.config.ts');

assert.equal(pkg.dependencies['@capacitor/core'], '8.5.2');
assert.ok(pkg.dependencies['@capacitor/app'], 'Capacitor App plugin missing');
assert.match(config, /appId:\\s*['\"]com\\.proproster\\.app['\"]/);
assert.match(config, /appName:\\s*['\"]PropRoster['\"]/);
assert.match(config, /url:\\s*['\"]https:\\/\\/proproster\\.com['\"]/);
assert.match(config, /cleartext:\\s*false/);
assert.ok(existsSync(new URL('ios/README.md', root)), 'iOS architecture guide missing');

console.log('PropRoster iOS foundation identity and development settings verified.');
console.log('This check does not compile or validate an iOS application.');
