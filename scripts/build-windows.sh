#!/usr/bin/env bash
# Build Frappe Cafe for Windows
# Usage: ./scripts/build-windows.sh
# Note: This script runs on Windows or in a Git Bash/WSL environment

set -e

echo "🪟 Building Frappe Cafe for Windows"
echo "======================================"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
  echo "❌ Node.js 24+ required (found $(node -v))"
  exit 1
fi

# Allow running on Git Bash / WSL / MSYS
PLATFORM=$(uname -s)
if [[ "$PLATFORM" != "MINGW"* ]] && [[ "$PLATFORM" != "MSYS"* ]] && [[ "$PLATFORM" != "CYGWIN"* ]] && [ "$PLATFORM" != "Linux" ]; then
  echo "❌ This script must run on Windows or a Windows compatibility layer (current platform: $PLATFORM)"
  exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo "Platform: $PLATFORM"
echo ""

# Install/update dependencies
echo "📥 Installing npm dependencies..."
npm ci --only=production > /dev/null 2>&1 || npm install > /dev/null 2>&1

# Build the app
echo "🔨 Building application..."
npm run build

echo ""
echo "✅ Windows build complete!"
echo ""
echo "📂 Artifacts:"
ls -lh out/*.zip 2>/dev/null || echo "   No ZIP artifacts found (check Electron Forge output)"
echo ""

# Build info
echo "🔍 Build details:"
echo "   Platform: Windows"
echo "   Version: $(cat package.json | grep '"version"' | cut -d'"' -f4)"
echo "   Build time: $(date)"
echo ""

echo "Next steps:"
echo "  1. Run: ./scripts/validate-artifacts.sh"
echo "  2. Test by extracting: tar -xf out/<artifact>.zip"
echo "  3. Run extracted exe: Frappe Cafe.exe"
