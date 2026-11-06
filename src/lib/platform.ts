/** True inside the Android app (Capacitor), false in a normal browser. */
export const isNativeApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
