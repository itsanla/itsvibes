#!/bin/bash
# Membangun versi web itsvibes (Expo web, mode SPA) dan memasangnya untuk itsvibes-server.
# Server membaca berkas dari ~/.local/state/itsvibes/web pada setiap permintaan, jadi hasil build baru
# langsung tampil tanpa restart service. Hasilnya ada di luar folder proyek supaya tidak ikut bsync.
set -euo pipefail
APP=/Data_A/project/personal/itsvibes/app
OUT=$HOME/.local/state/itsvibes
cd "$APP"
rm -rf "$OUT/web.new" "$OUT/web.old"
npx expo export -p web --output-dir "$OUT/web.new"
[ -d "$OUT/web" ] && mv "$OUT/web" "$OUT/web.old"
mv "$OUT/web.new" "$OUT/web"
rm -rf "$OUT/web.old"
echo "Web terpasang: $OUT/web ($(du -sh "$OUT/web" | cut -f1)), buka https://itsvibes.anla.my.id/"
