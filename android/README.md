# Gullak for Android

This is a lightweight Android WebView wrapper around the live Gullak Cloudflare-hosted app. It does not bundle a second copy of the website or introduce a separate local data store. The app loads:

`https://gullak-piggybank.ahansantra607.workers.dev/#/`

The native startup screen checks the latest published GitHub Release. If a newer semantic version has a `Gullak.apk` asset, it offers an update screen. **Update installation is always confirmed by Android/the user**; the app does not silently install updates. If GitHub is unavailable, the app opens normally.

## One-time signing setup (free)

1. In the repository, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Name it `ANDROID_KEY_ENCRYPTION_PASSWORD`.
3. Generate a long, unique password with a password manager. Do not reuse your GitHub password. Save it securely; losing it means future releases cannot decrypt the signing key.
4. Open **Actions → Set up Gullak Android signing key → Run workflow** on `main`.
5. The workflow creates a permanent Android signing key in a temporary GitHub runner, encrypts it with GPG/AES-256 using the secret above, and commits only the encrypted bundle at `android/signing/gullak-signing.zip.gpg`. It refuses to replace an existing key.
6. Keep the encryption password in a password manager and keep the encrypted repository file. Never publish or share the password or a decrypted keystore.

The private signing key is never uploaded as a workflow artifact and is never committed in plaintext. GitHub Actions decrypts it only in the temporary release runner.

## Publish a new APK

1. Create a GitHub Release from the current `main` commit.
2. Use a tag in `vMAJOR.MINOR.PATCH` format, such as `v1.0.0`.
3. Publish the release. The Android release workflow builds a signed universal APK and attaches it as `Gullak.apk`.
4. The Android app checks the latest published release at startup and offers the update if its version is newer.

The Android build-check workflow also builds a debug APK on changes to the Android project. Debug APKs are for testing only; they are signed differently and must not be used as upgrades to the release app.

## Technical notes

- Package ID: `com.ahansantra607.gullak` (keep this unchanged after first release).
- Min Android version: Android 6.0 (API 23).
- Release signing key: one permanent encrypted PKCS#12 key.
- No Play Store or Apple developer account is required for direct APK distribution.
- The app requires an internet connection because the actual Gullak app is hosted remotely.
