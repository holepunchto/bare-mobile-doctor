# 🩺 Bare Mobile Doctor!

The Bare doctor application for mobile.

## Usage

Start by installing the dependencies:

```sh
npm install
```

> Be sure to have `patchelf` binary installed.

Then, you can bundle worklets:

```sh
npm run bundle
```

When finished, you can run the app on either iOS or Android.

### iOS

```sh
npm run ios
```

### Android

> [!IMPORTANT]
> You may experience problems running the app on an emjlated Android device under QEMU due to https://github.com/holepunchto/libjs/issues/4. If you encounter crashes, try running the app on a real Android device instead.

```sh
npm run android
```

## License

Apache-2.0
