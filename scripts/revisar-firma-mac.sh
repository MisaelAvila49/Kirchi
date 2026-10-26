#!/usr/bin/env bash
# Revisa la firma ad hoc de Kirchi.app en macOS (corre en el flujo de instaladores, después de electron-builder --mac).
# Falla si algo del paquete queda sin firmar o con la firma rota. `spctl` solo informa: una firma ad hoc no pasa Gatekeeper.
set -euo pipefail

APP="${1:-$(ls -d dist/mac*/Kirchi.app | head -n 1)}"
echo "Aplicación: $APP"

echo "== codesign --verify --deep --strict =="
codesign --verify --deep --strict --verbose=2 "$APP"

echo "== firma del ejecutable principal =="
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E 'Identifier|Signature|flags|TeamIdentifier' || true
codesign -dv "$APP" 2>&1 | grep -q 'Signature=adhoc' || { echo 'La firma no es ad hoc'; exit 1; }

echo "== avisos de Electron y Chromium (electron-builder los borra; electron-builder.yml los vuelve a poner) =="
for a in LICENSE.electron.txt LICENSES.chromium.html; do
  test -s "$APP/Contents/Resources/$a" || { echo "Falta $APP/Contents/Resources/$a"; exit 1; }
done
grep -q 'Permission is hereby granted' "$APP/Contents/Resources/LICENSE.electron.txt" || { echo 'LICENSE.electron.txt no parece la licencia MIT de Electron'; exit 1; }
echo "Avisos presentes: LICENSE.electron.txt y LICENSES.chromium.html"

echo "== nada suelto en Contents/ (rompe la firma del paquete) =="
extra="$(find "$APP/Contents" -maxdepth 1 -type f ! -name Info.plist ! -name PkgInfo | head)"
test -z "$extra" || { echo "Archivos sueltos en Contents/: $extra"; exit 1; }

echo "== ngspice y sus modelos de código =="
NGSPICE="$APP/Contents/Resources/herramientas/ngspice"
test -d "$NGSPICE" || { echo "Falta $NGSPICE"; exit 1; }
n=0
while IFS= read -r f; do
  if file "$f" | grep -q 'Mach-O'; then
    codesign --verify --strict --verbose=1 "$f"
    archs="$(lipo -archs "$f")"
    case "$archs" in *x86_64*arm64*|*arm64*x86_64*) ;; *) echo "$f no es universal ($archs)"; exit 1 ;; esac
    n=$((n + 1))
  fi
done < <(find "$NGSPICE" -type f)
echo "Binarios de ngspice firmados y universales: $n"
test "$n" -ge 2 || { echo 'Se esperaban al menos el ejecutable y un modelo .cm'; exit 1; }

echo "== el ejecutable de ngspice arranca desde el paquete =="
BIN="$(find "$NGSPICE" -type f -name ngspice -perm -u+x | head -n 1)"
"$BIN" -n -v </dev/null 2>&1 | head -n 3 || true

echo "== spctl (informativo) =="
spctl --assess --type execute --verbose=4 "$APP" 2>&1 || echo '(esperado: una firma ad hoc no pasa Gatekeeper; el usuario la autoriza a mano)'

echo "== dmg =="
DMG="$(ls dist/Kirchi-*-macos-*.dmg | head -n 1)"
MONTAJE="$(mktemp -d)"
hdiutil attach "$DMG" -mountpoint "$MONTAJE" -nobrowse -readonly -quiet
trap 'hdiutil detach "$MONTAJE" -quiet || true' EXIT
codesign --verify --deep --strict "$MONTAJE/Kirchi.app"
echo "dmg: la aplicación copiada conserva una firma válida"
