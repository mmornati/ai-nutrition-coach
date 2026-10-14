#!/usr/bin/env bash
# Debug APK build + its secrets scan (S1). Debug only: a release build needs
# apps/client/android/key.properties, which CI deliberately does not have.
#
# Toolchain: Flutter 3.44.0 with an Android SDK at $ANDROID_HOME (or
# $ANDROID_SDK_ROOT). flutter_secure_storage 11 compiles against android-37,
# which a preinstalled SDK may lack, so it is installed here.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?ANDROID_HOME or ANDROID_SDK_ROOT must be set}}"
sdkmanager="$sdk/cmdline-tools/latest/bin/sdkmanager"

git config --global --add safe.directory "$PWD"
flutter pub get --enforce-lockfile
yes | "$sdkmanager" --licenses > /dev/null || true
"$sdkmanager" "platforms;android-37"
(cd apps/client && flutter build apk --debug)
bash tools/check_no_secrets_in_build.sh --apk-only

echo 'apk: PASS'
