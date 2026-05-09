#!/usr/bin/env bash
# Build all platforms (only runs on the current platform with cross-compilation)
# Usage: ./scripts/build-all.sh

set -e

echo "🔨 Local Bench Multi-Platform Build"
echo "===================================="
echo ""

# Get the current platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "Current platform: $PLATFORM ($ARCH)"
echo ""

# For MVP, we build only the current platform
# Cross-compilation support can be added in Phase 12 if needed

case "$PLATFORM" in
  Darwin)
    echo "📦 Building for macOS..."
    bash scripts/build-mac.sh
    ;;
  Linux)
    echo "📦 Building for Linux..."
    bash scripts/build-linux.sh
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "📦 Building for Windows..."
    bash scripts/build-windows.sh
    ;;
  *)
    echo "❌ Unsupported platform: $PLATFORM"
    exit 1
    ;;
esac

echo ""
echo "✅ Build complete!"
echo ""
echo "📂 Artifacts location: ./out"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/validate-artifacts.sh"
echo "  2. Download and test an artifact"
echo "  3. Verify core MVP flows work correctly"
