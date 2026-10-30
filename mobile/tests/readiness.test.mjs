import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root = join(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

test('both native projects exist and have independent package', () => {
  assert.ok(existsSync(join(root, 'mobile/ios/App/App.xcodeproj')))
  assert.ok(existsSync(join(root, 'mobile/android/app/build.gradle')))
  const pkg = JSON.parse(read('mobile/package.json'))
  assert.ok(pkg.dependencies['@capacitor/ios'])
  assert.ok(pkg.dependencies['@capacitor/android'])
})

test('native production shell targets HTTPS production only', () => {
  const config = read('mobile/capacitor.config.ts')
  assert.match(config, /appId:\s*'com\.proproster\.app'/)
  assert.match(config, /url:\s*'https:\/\/proproster\.com'/)
  assert.doesNotMatch(config, /allowNavigation\s*:/)
  assert.doesNotMatch(config, /cleartext:\s*true/)
  assert.doesNotMatch(config, /process\.env\./)
})

test('development server configuration stays separate from production', () => {
  const config = read('mobile/capacitor.config.dev.json')
  assert.match(config, /localhost:3000/)
  assert.doesNotMatch(read('mobile/capacitor.config.ts'), /localhost:3000'\s*,/)
})

test('web installability metadata and non-caching worker remain present', () => {
  const manifest = read('app/manifest.ts')
  assert.match(manifest, /display:\s*'standalone'/)
  assert.match(manifest, /icon-192\.png/)
  assert.match(manifest, /icon-512\.png/)
  const worker = read('public/sw.js')
  assert.doesNotMatch(worker, /caches\.(?:open|match)/)
  assert.match(worker, /fetch\(event\.request\)/)
})
