#!/usr/bin/env bash
# Gera o APK do SKYNET a partir deste repositório.
# Uso: KEYSTORE_BASE64=... KEYSTORE_PASSWORD=... ./android/build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?defina ANDROID_HOME (Android SDK com platform 34)}"
export KEY_ALIAS="${KEY_ALIAS:-skynet}"
gradle --no-daemon assembleRelease
mkdir -p ../dist
cp app/build/outputs/apk/release/app-release.apk "../dist/skynet-${1:-$(date +%Y%m%d)}.apk"
echo "APK em dist/"
