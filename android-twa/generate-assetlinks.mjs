#!/usr/bin/env node
// Generate Android Digital Asset Links only from an explicitly supplied
// Google Play *app signing* SHA-256 fingerprint. Never guess the fingerprint.
import { writeFileSync } from 'node:fs';

const fingerprint = process.env.PLAY_APP_SIGNING_SHA256?.trim().toUpperCase();
const valid = /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/;
if (!fingerprint || !valid.test(fingerprint)) {
  console.error('Set PLAY_APP_SIGNING_SHA256 to the 32-byte colon-delimited SHA-256 fingerprint from Google Play Console > App integrity > App signing.');
  process.exit(1);
}
const links = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'com.proproster.app',
    sha256_cert_fingerprints: [fingerprint],
  },
}];
const destination = process.argv[2] || 'assetlinks.json';
writeFileSync(destination, JSON.stringify(links, null, 2) + '\n', {flag: 'w'});
console.log('Created Digital Asset Links JSON at ' + destination + '. Publish only after confirming the certificate in Play Console.');
