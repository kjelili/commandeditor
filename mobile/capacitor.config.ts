import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor native shell for CommandEditor (iOS + Android).
// It loads the SAME static web export the desktop app uses — no separate
// mobile codebase. Build the web export first (MOBILE_BUILD=1 pnpm build at the
// repo root -> ./out), then `cap sync`.
const config: CapacitorConfig = {
  appId: 'com.commandeditor.app',
  appName: 'CommandEditor',
  webDir: '../out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
