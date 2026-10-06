# Yaqeen mobile demos

Android demo: [Open Yaqeen on Appetize](https://appetize.io/app/b_wqkj7megp6qf6sflzm7b6mv5um).
iOS demo: [Open Yaqeen on Appetize](https://appetize.io/app/b_b47ximmaba545lbmghsswmz5ra).
Uploaded on 5 October 2026. No Appetize session was started; all 30 free minutes
were still available after upload.

Native Android WebView and iOS WKWebView apps for the Appetize hackathon demo. They open the existing
live app at `https://app.yaqeenguide.com/app/`, using its existing backend and
sign-in configuration. No new repository or frontend dependencies are needed.

Both builds contain the native shell and logo; web assets load from the live site.
Deploying website changes updates the demo automatically. Local web edits must
be deployed to the website before they appear in either demo.

## Android build

Requires JDK 17+ and Android SDK platform 36 with build tools 35.0.0.
Set `sdk.dir=/absolute/path/to/android/sdk` in the ignored `local.properties`.
From this directory:

```sh
rtk proxy ./gradlew assembleDebug lintDebug --console plain
```

Upload `app/build/outputs/apk/debug/app-debug.apk` to Appetize. A debug-signed
APK is supported for the demo; this is not an app-store release.

## iOS simulator build

Requires Xcode on macOS. From `ios/`:

```sh
rtk proxy xcodebuild -project Yaqeen.xcodeproj -scheme Yaqeen -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO ARCHS=arm64 build
rtk proxy ditto -c -k --keepParent build/Build/Products/Debug-iphonesimulator/Yaqeen.app build/Yaqeen-ios.zip
```

Upload `ios/build/Yaqeen-ios.zip` to Appetize as a separate iOS app. This is
an ARM64 simulator bundle, not an iPhone installation or App Store release;
no paid Apple developer account is required to build it.

## Updates and public sharing

Use Appetize's **Share** action for the build to get the public build link.
An app identifier link can require an Appetize organization login, so use the
public build link when sharing with judges.

For native changes, rebuild the relevant platform and use the existing build's **Update build**
action to retain its shared link. Change `versionCode` and `versionName` in
`app/build.gradle` when uploading a separate version.

Do not launch an Appetize session while preparing a deployment if you want to
save its free streaming minutes. Uploading and copying the share link require
no emulator session.

## Demo behavior

- Website navigation stays in the app; external source links open a browser.
- Android Back navigates through page history. A failed page load offers Retry.
- iOS uses swipe gestures to navigate back and forward.
- JavaScript and session storage are enabled. File access and cleartext HTTP
  are disabled, and no JavaScript-to-native bridge is exposed.
- Microphone access requires the learner's Android permission and a trusted
  website origin. iOS also prompts for microphone access. Appetize microphone
  availability depends on the session.
- Use email/password to sign in inside the demo. Google OAuth offers to open
  the web app in a browser, where its session stays separate. Returning a Google
  session to the native app needs a browser callback integration.

## Navigation check

```sh
rtk proxy mkdir -p /private/tmp/yaqeen-routing
rtk proxy javac -d /private/tmp/yaqeen-routing app/src/main/java/com/yaqeenguide/app/NavigationPolicy.java check/CheckRouting.java
rtk proxy java -ea -cp /private/tmp/yaqeen-routing com.yaqeenguide.app.CheckRouting
```

The check covers trusted hosts, malicious lookalike URLs, HTTPS, external links,
and OAuth navigation. For the equivalent iOS policy check, from `ios/`:

```sh
rtk proxy xcrun swiftc -module-cache-path /private/tmp/yaqeen-swift-cache Yaqeen/NavigationPolicy.swift check/main.swift -o /private/tmp/yaqeen-ios-routing-check
rtk proxy /private/tmp/yaqeen-ios-routing-check
```

Both native builds and navigation checks pass. Android lint and signature
verification also pass. Runtime behavior remains untested at the user's request.
No Appetize emulator session was started during deployment.
