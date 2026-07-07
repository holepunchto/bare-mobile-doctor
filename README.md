# 🩺 Bare Mobile Doctor!

The Bare doctor application for mobile.

## Usage

Start by installing the dependencies:

```sh
npm install
```

> Be sure to have `patchelf` binary installed.

> [!IMPORTANT]
> If your npm config has `ignore-scripts=true` (e.g. in `~/.npmrc`), `@shopify/react-native-skia`'s postinstall step (which downloads its prebuilt native binaries) won't run, and native builds will fail with `Skia prebuilt binaries not found!`. Fix by running its install script directly:
>
> ```sh
> node node_modules/@shopify/react-native-skia/scripts/install-skia.mjs
> ```

Then, you can bundle worklets:

```sh
npm run bundle
```

When finished, you can run the app on either iOS or Android.

### iOS

```sh
npm run ios
```

#### Release builds

First, generate the native iOS project:

```sh
npx expo prebuild --platform ios
```

Then open the Xcode workspace:

```sh
open ios/BareMobileDoctor.xcworkspace
```

In Xcode:

1. Select the `BareMobileDoctor` scheme in the toolbar
2. Set the build configuration to **Release** (Edit Scheme → Run → Info → Build Configuration)
3. Under Signing & Capabilities, select your development team and provisioning profile
4. Select your physical device as the run destination
5. Build and run (⌘R)

### Android

> [!IMPORTANT]
> You may experience problems running the app on an emjlated Android device under QEMU due to https://github.com/holepunchto/libjs/issues/4. If you encounter crashes, try running the app on a real Android device instead.

You'll need [Android Studio](https://developer.android.com/studio) installed, along with the Android SDK components this project targets. If you don't already have an SDK set up, install the pieces via `sdkmanager` (bundled with Android Studio, or download the [command line tools](https://developer.android.com/studio#command-line-tools-only) standalone):

```sh
sdkmanager "platform-tools" "platforms;android-34" "platforms;android-35" "platforms;android-36" "build-tools;35.0.0" "build-tools;36.0.0" "ndk;27.1.12297006"
```

Then set the following environment variables (e.g. in your shell profile):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export JAVA_HOME="/opt/android-studio/jbr"  # or any JDK 17+
export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"
```

> [!IMPORTANT]
> The generated `android/` folder (via `expo prebuild`) ships a Gradle 9.0.0 wrapper that's incompatible with the `foojay-resolver-convention` plugin pinned by React Native 0.83's gradle plugin (`JvmVendorSpec does not have member field 'IBM_SEMERU'`, see [facebook/react-native#55781](https://github.com/facebook/react-native/issues/55781)). Until that's fixed upstream, downgrade the wrapper after any prebuild:
>
> ```sh
> sed -i 's/gradle-9.0.0-bin.zip/gradle-8.13-bin.zip/' android/gradle/wrapper/gradle-wrapper.properties
> ```

```sh
npm run android
```

#### Release builds

Debug builds work fine for local development, but if you want to test features like Bluetooth across two physical devices, a release build avoids needing a Metro dev server connection per device:

```sh
npx expo run:android --variant release --no-bundler
```

This project's release build type is signed with the debug keystore (see `android/app/build.gradle`), so no signing setup is required for local testing. The APK lands at `android/app/build/outputs/apk/release/app-release.apk` and can be installed on additional devices directly, without rebuilding:

```sh
adb devices                          # note the serial of each device
adb -s <serial> install -r android/app/build/outputs/apk/release/app-release.apk
```

## License

Apache-2.0
