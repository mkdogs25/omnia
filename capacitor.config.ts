import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is the built website (dist/) running inside a WebView. Notes live in the app's private storage and
// are kept in step with other devices through Sync.
const config: CapacitorConfig = {
  appId: 'io.github.mkdogs25.omnia',
  appName: 'Omnia',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_omnia', iconColor: '#d95c3a' }
  }
}

export default config
