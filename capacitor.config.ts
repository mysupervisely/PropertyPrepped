import type { CapacitorConfig } from '@capacitor/cli';

/** Development-only native shell. Do not submit a server.url shell to App Store. */
const config: CapacitorConfig = {
  appId: 'com.proproster.app',
  appName: 'PropRoster',
  webDir: 'public',
  server: {
    url: 'https://proproster.com',
    cleartext: false,
    allowNavigation: ['proproster.com'],
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
