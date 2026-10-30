#!/bin/bash
# Membangun APK rilis itsvibes di Bima. Build dikerjakan di salinan ~/.cache/itsvibes-build supaya
# hasil Gradle (ratusan MB) tidak ikut tersinkron bsync project. Hasil: ~/.local/state/itsvibes/apk/,
# bisa diunduh dari https://itsvibes.anla.my.id/download
set -euo pipefail
SRC=/Data_A/project/personal/itsvibes
WORK=$HOME/.cache/itsvibes-build
export ANDROID_HOME=$HOME/Android/Sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
set -a; source $HOME/.config/itsvibes/signing.env; set +a

mkdir -p $WORK
# pola diberi "/" di depan supaya hanya folder di tingkat atas yang dilewati: android/ milik modul native harus ikut
rsync -a --delete --exclude /node_modules --exclude /android --exclude /.expo $SRC/app/ $WORK/app/
rsync -a --delete $SRC/shared/ $WORK/shared/
cd $WORK/app
npm install --no-audit --no-fund --loglevel=error
npx expo prebuild --platform android --clean --no-install
cd android
# hanya arm64-v8a (Samsung S21+): build lebih cepat dan APK lebih kecil
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a "$@"

VERSION=$(node -p "require('$WORK/app/app.json').expo.version")
OUT=$HOME/.local/state/itsvibes/apk
mkdir -p $OUT
cp app/build/outputs/apk/release/app-release.apk $OUT/itsvibes-$VERSION.apk
echo "APK: $OUT/itsvibes-$VERSION.apk ($(du -h $OUT/itsvibes-$VERSION.apk | cut -f1))"
