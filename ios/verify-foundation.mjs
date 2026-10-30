import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const pkg = JSON.parse(read('mobile/package.json'));
const config = read('mobile/capacitor.config.ts');
const project = read('mobile/ios/App/App.xcodeproj/project.pbxproj');
const workflow = read('codemagic.yaml');

assert.equal(pkg.dependencies['@capacitor/core'], '8.5.2');
assert.equal(pkg.dependencies['@capacitor/ios'], pkg.dependencies['@capacitor/core']);
assert.ok(pkg.dependencies['@capacitor/app'], 'Capacitor App plugin missing');
assert.match(config, /appId:\s*['"]com\.proproster\.app['"]/);
assert.match(config, /appName:\s*['"]PropRoster['"]/);
assert.match(config, /url:\s*['"]https:\/\/proproster\.com['"]/);
assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.proproster\.app;/);
assert.ok(existsSync(new URL('mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme', root)), 'Shared App scheme missing');
assert.match(workflow, /ios-simulator-unsigned:/);
assert.match(workflow, /ios-testflight:/);
assert.match(workflow, /mobile\/ios\/App\/App\.xcodeproj/);

console.log('Canonical mobile iOS identity, project, shared scheme, and workflow references verified.');
console.log('This source check does not compile, launch, sign, or validate store approval of an iOS application.');
