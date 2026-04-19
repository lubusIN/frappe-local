#!/usr/bin/env bash
# Build Frappe Cafe for macOS with optional code signing and notarization
# Usage: ./scripts/build-mac.sh
# Environment variables (optional):
#   APPLE_ID - Apple ID email for notarization
#   APPLE_PASSWORD - App-specific password for notarization
#   APPLE_TEAM_ID - Apple Developer Team ID

set -e

echo "🍎 Building Frappe Cafe for macOS"
echo "===================================="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
  echo "❌ Node.js 24+ required (found $(node -v))"
  exit 1
fi

# Ensure we're on macOS
if [ "$(uname -s)" != "Darwin" ]; then
  echo "❌ This script must run on macOS (current platform: $(uname -s))"
  exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo ""

# Check for code signing configuration
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
  echo "⚠️  Code signing disabled (environment variables not set)"
  echo "   For production releases, set:"
  echo "     export APPLE_ID=your-apple-id@example.com"
  echo "     export APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx"
  echo "     export APPLE_TEAM_ID=XXXXXXXXXX"
  echo ""
  echo "   See docs/PACKAGING.md for setup instructions"
  echo ""
else
  echo "✅ Code signing enabled"
  echo "   Apple ID: $APPLE_ID"
  echo "   Team ID: $APPLE_TEAM_ID"
  echo ""
fi

# Install/update dependencies
echo "📥 Installing dependencies..."
npm ci --only=production > /dev/null 2>&1 || npm install > /dev/null 2>&1

# Build the app
echo "🔨 Building application..."
npm run build

echo ""
echo "✅ macOS build complete!"
echo ""
echo "📂 Artifacts:"
ls -lh out/*.zip 2>/dev/null || echo "   No ZIP artifacts found (check Electron Forge output)"
echo ""

# Build info
echo "🔍 Build details:"
echo "   Platform: macOS"
echo "   Version: $(cat package.json | grep '"version"' | cut -d'"' -f4)"
echo "   Build time: $(date)"
echo ""

echo "Next steps:"
echo "  1. Run: ./scripts/validate-artifacts.sh"
echo "  2. Test by running: ./out/<artifact>.zip (extract and test)"
