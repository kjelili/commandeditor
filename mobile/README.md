# CommandEditor — Mobile (Capacitor)

Native iOS and Android shells that load the **same static web export** as the
desktop app. There is no separate mobile UI to maintain — the browser app *is*
the mobile app, wrapped in a native container so it can ship to the App Store and
Google Play.

## Build the web assets first (from the repo root)

```bash
MOBILE_BUILD=1 pnpm build      # produces ./out (static export)
```

## Android (works on Windows/Linux/macOS)

```bash
cd mobile
npm install
npx cap add android            # first time only — generates mobile/android/
npx cap sync android           # copies ../out into the native project
cd android && ./gradlew assembleDebug
# APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk
```
CI builds this automatically — see `.github/workflows/mobile.yml`.

## iOS (requires macOS + Xcode)

```bash
cd mobile
npm install
npx cap add ios
npx cap sync ios
npx cap open ios               # then build/sign in Xcode
```
iOS signing reuses your Apple Developer account (Team ID `49GN48PCG5`).

## App icons

Generate branded icons from the ⌘ mark:
```bash
cp ../public/icon-512.png assets/icon.png   # 1024x1024 recommended
npx @capacitor/assets generate
```

## Notes
- Release signing (Play Store `.aab`, App Store) is added later, like the desktop
  signing flow.
- Some browser-only APIs (File System Access, WebRTC) may behave differently in a
  WebView — verify feature parity on a device before release.
