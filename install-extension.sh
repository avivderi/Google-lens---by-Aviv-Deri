#!/usr/bin/env bash
# install-extension.sh
# Installs the Circle AI GNOME Shell extension and optionally enables it.
# Run this ONCE, then log out and log back in for the extension to load.

set -euo pipefail

EXTENSION_UUID="circle-ai-capture@avivderi.github.io"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/gnome-extension"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "=== Circle AI — GNOME Extension Installer ==="
echo ""

# Verify GNOME Shell version
GNOME_VER=$(gnome-shell --version | grep -oP '\d+\.\d+' | head -1)
echo "Detected GNOME Shell: $GNOME_VER"

# Copy files
echo "Installing to: $DEST_DIR"
mkdir -p "$DEST_DIR/assets"
cp "$SRC_DIR/metadata.json" "$DEST_DIR/"
cp "$SRC_DIR/extension.js"  "$DEST_DIR/"
if [ -f "$SRC_DIR/prefs.js" ]; then
    cp "$SRC_DIR/prefs.js" "$DEST_DIR/"
fi
if [ -f "$SRC_DIR/assets/tray-icon.png" ]; then
    cp "$SRC_DIR/assets/tray-icon.png" "$DEST_DIR/assets/"
else
    cp "$SCRIPT_DIR/assets/tray-icon.png" "$DEST_DIR/assets/"
fi

# Enable extension (may need a re-login to actually load it under Wayland)
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
    echo "Extension enabled. ⚠️  On Wayland you MUST log out and log back in!"
else
    echo "gnome-extensions CLI not found — enable manually via Extensions app."
fi

echo ""
echo "Next steps:"
echo "  1. Log out and log back in (Wayland requires full restart to load extensions)"
echo "  2. Verify with: gnome-extensions list | grep circle-ai"
echo "  3. Ping test:   gdbus call --session --dest org.gnome.Shell \\"
echo "       --object-path /io/github/avivderi/CircleAI \\"
echo "       --method io.github.avivderi.CircleAI.Ping"
echo "  4. cp .env.example .env && nano .env   (add your ANTHROPIC_API_KEY)"
echo "  5. npm install && npm start"
