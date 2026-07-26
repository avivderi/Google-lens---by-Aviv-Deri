#!/usr/bin/env bash
# package-extension.sh
# Creates a zip package of the GNOME Shell extension for extensions.gnome.org

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/gnome-extension"
DIST_DIR="$SCRIPT_DIR/dist"
UUID="circle-ai-capture@avivderi.github.io"
ZIP_NAME="circle-ai-extension.zip"

echo "=== Circle AI — Packaging GNOME Shell Extension ==="
mkdir -p "$DIST_DIR"

cd "$EXT_DIR"
zip -r "$DIST_DIR/$ZIP_NAME" metadata.json extension.js prefs.js assets/

echo ""
echo "✅ GNOME Extension packaged successfully:"
echo "   $DIST_DIR/$ZIP_NAME"
echo ""
echo "To publish on extensions.gnome.org:"
echo "  1. Go to https://extensions.gnome.org/upload/"
echo "  2. Log in and upload '$DIST_DIR/$ZIP_NAME'"
echo "  3. Wait for GNOME extension reviewer approval."
