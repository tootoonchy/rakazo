# Releasing the white-label apps

How the Agental desktop and mobile apps are named, built, signed and published. The apps are
the upstream apps with the brand applied when they are built; nothing in upstream's own release
workflows changes, and this branch never runs them.

Nothing in this file is a secret. Signing keys, account identifiers and passwords live only in
the `apps-release` environment of the repository and in the Expo project.

## What the brand changes

One config (`packages/contracts/src/brand/brand.ts`) names the apps:

| | iOS | Android | Desktop |
| --- | --- | --- | --- |
| Name | Agental | Agental | Agental |
| Identifier | `com.agental.app` | `com.agental.app` | `com.agental.desktop` |
| Links | `agental://` | `agental://` | none |

- **Mobile.** `apps/mobile/app.json` stays as upstream wrote it. `app.config.ts` applies the
  brand to it: name, link schemes, the app and extension identifiers, the shared container, the
  permission prompts and the icon files in `apps/mobile/assets/brand/agental/`. Check the result
  with `pnpm exec expo config --json` from `apps/mobile`.
- **Desktop.** `apps/desktop/scripts/brand-package.ts` rewrites `apps/desktop/package.json` in a
  release checkout: product name, app identifier, permission prompts, icon and update feed. The
  setup window shows the brand's name, colors and corners. The first launch opens the hosted app
  when the build is given one (`RAKAZO_CLOUD_URL`), and otherwise asks where to connect.
- **Server.** Sign-in accepts `agental://` as a return address, and the Android association
  file names `com.agental.app`.

The upstream Expo project and the upstream update feed are never carried into a branded build:
a build without its own Expo project fails, and a desktop package without a release repository
has no update feed at all.

## Accounts to create first

| Account | Needed for | Lead time |
| --- | --- | --- |
| Apple Developer Program, as the company | iOS app, macOS signing and notarization | Days to weeks (company verification) |
| Google Play Console, as the company | Android app | Days (identity verification, then testing rules for new accounts) |
| Expo | Mobile builds, over-the-air updates, push delivery | Minutes |
| Firebase project | Android push | Minutes |
| Windows code signing (a trusted signing account or an EV certificate) | Windows installer without warnings | Days to weeks |

## Settings

Create an `apps-release` environment in the repository with required reviewers, then add:

| Name | Kind | Used by |
| --- | --- | --- |
| `EXPO_TOKEN` | secret | mobile builds |
| `EXPO_OWNER` | variable | the Expo account that owns the project |
| `EAS_PROJECT_ID` | variable | the Expo project |
| `APP_URL` | variable | the hosted app the apps open, such as `https://app.example.com` |
| `DESKTOP_MAC_CSC_LINK` | secret | Developer ID Application certificate and key, base64 P12 |
| `DESKTOP_MAC_CSC_KEY_PASSWORD` | secret | the P12 password |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY_P8` | secrets | notarization |

In the Expo project's `production` environment, set the same `EXPO_OWNER`, `EAS_PROJECT_ID` and
`EXPO_PUBLIC_API_URL` (the build machines read the app config again), and `GOOGLE_SERVICES_JSON`
as a secret file for Android push.

Once the hosted app and the store listings exist, name them. None is a secret, and each must be
an `https` address or it is ignored:

| Name | Where | What it is |
| --- | --- | --- |
| `RAKAZO_CLOUD_URL` | the server, and the desktop build (the workflow passes `APP_URL`) | the hosted app the desktop app opens first |
| `BRAND_IOS_STORE_URL`, `BRAND_ANDROID_STORE_URL`, `BRAND_ANDROID_APK_URL` | the server | the store listings and the direct Android download |
| `EXPO_PUBLIC_BRAND_IOS_STORE_URL`, `EXPO_PUBLIC_BRAND_ANDROID_STORE_URL`, `EXPO_PUBLIC_BRAND_ANDROID_APK_URL` | the Expo project's `production` environment | the same three, built into the mobile app |

Until they are set, the apps show no store, review or "update from the store" links.

Lifecycle emails stay off: the deployment sets no `EMAIL_COPY_DIR`.

On the server, set `EXPO_ACCESS_TOKEN` for push delivery, `PASSKEY_APPLE_APP_IDS` and
`PASSKEY_ANDROID_CERT_SHA256` if the apps should offer passkeys, and the `APNS_VOIP_*` variables
only if incoming voice calls are wanted.

## Mobile

1. From `apps/mobile`, create the Expo project (`eas project:init`) under your account and note
   its owner and project id.
2. Let the build service create and store the signing credentials the first time
   (`eas credentials`): the iOS distribution certificate and profiles for the app and its four
   extensions, the push key, and the Android upload key.
3. Run the `agental-apps` workflow with target `android` or `ios`. It starts the build and
   prints where to follow it.
4. Submit the finished build (`eas submit`), using your own store identifiers kept outside Git.
5. Once the listings exist, fill `stores` in the brand config. Until then the app shows no
   store or review links.

Push notifications need no code change: the app registers with the Expo project above, iOS uses
the push key stored there, and Android uses the Firebase file.

## Desktop

Run the `agental-apps` workflow with target `desktop-mac`. It builds the app, applies the brand,
signs with the Developer ID certificate, notarizes, verifies the signature and ticket, and
keeps the disk image as a workflow artifact for 14 days.

Windows is not automated here. Upstream signs Windows builds with a cloud signing account tied
to its own repository; a white-label needs its own signing account before a Windows job is
worth adding. Until then a Windows build shows the unknown-publisher warning and should not be
distributed.

## What has been checked, and what has not

Checked on this branch: the resolved mobile config for both brands, unit tests for the config,
the desktop package rewrite and the setup page, and a packaged Linux build that opens as
"Agental" with the brand's setup window and its own update feed.

Not checked, because each needs an account or a device this branch has never had:

- The `agental-apps` workflow has never run.
- No iOS or Android build has been made, installed or opened.
- No macOS build has been signed or notarized.
- Push delivery, sign-in return links and share-to-app have not been tried on a device.

## Known gaps

- **Icons are placeholders.** Replace the files in `apps/mobile/assets/brand/agental/` and
  `apps/desktop/assets/brand/agental/` with the real artwork at the same sizes. The mark shown
  inside the mobile app and the iOS widget still uses upstream's image.
- **The upstream link scheme is still registered.** Native links (notification taps, the
  bots-at-work card, shortcuts, answering a call) now use `agental://`: the build hands the
  scheme to native code through `Info.plist` and the Android manifest
  (`apps/mobile/plugins/with-link-scheme.js`). `rakazo://` stays registered beside it only until
  a build has been tested on devices, so a link made by an older build still opens. Remove it by
  returning one scheme from `appSchemes` in the brand config. The Swift and Kotlin changes have
  not been compiled: this branch has no Apple or Android toolchain.
- **"This computer" in the desktop app** downloads and runs upstream's server images. It works,
  but that local server is not the white-label. The macOS build is packaged without the
  downloadable server bundle, because the workflow publishes none, so on a Mac that choice
  uses Docker.
- **Desktop updates.** The macOS update feed points at this repository's releases, and the
  workflow publishes none yet. Linux update signatures are pinned to upstream's key, so a
  branded Linux build cannot update itself.
- **The welcome email** links to upstream's app downloads. Leave lifecycle emails off until the
  brand's own listings exist.
