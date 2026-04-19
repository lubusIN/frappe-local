#!/usr/bin/env bash
# Build Frappe Cafe for Linux
# Usage: ./scripts/build-linux.sh

set -e

echo "🐧 Building Frappe Cafe for Linux"
echo "====================================="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
  echo "❌ Node.js 24+ required (found $(node -v))"
  exit 1
fi

# Ensure we're on Linux
if [ "$(uname -s)" != "Linux" ]; then
  echo "❌ This script must run on Linux (current platform: $(uname -s))"
  exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo "Linux version: $(lsb_release -d 2>/dev/null || echo 'Unknown')"
echo ""

# Check for build dependencies
echo "📋 Checking for build dependencies..."

BUILD_DEPS=("python3" "g++")
MISSING_DEPS=()

for dep in "${BUILD_DEPS[@]}"; do
  if ! command -v "$dep" &> /dev/null; then
    MISSING_DEPS+=("$dep")
  fi
done

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
  echo "⚠️  Missing build dependencies: ${MISSING_DEPS[*]}"
  echo ""
  echo "Install with:"
  echo "  Ubuntu/Debian: sudo apt-get install -y python3 build-essential"
  echo "  Fedora/RHEL: sudo dnf install -y python3 gcc-c++ make"
  echo ""
  exit 1
fi

echo "✅ Build dependencies found"
echo ""

# Install/update dependencies
echo "📥 Installing npm dependencies..."
npm ci --only=production > /dev/null 2>&1 || npm install > /dev/null 2>&1

# Build the app
echo "🔨 Building application..."
npm run build

echo ""
echo "✅ Linux build complete!"
echo ""
echo "📂 Artifacts:"
ls -lh out/*.zip 2>/dev/null || echo "   No ZIP artifacts found (check Electron Forge output)"
echo ""

# Build info
echo "🔍 Build details:"
echo "   Platform: Linux"
echo "   Version: $(cat package.json | grep '"version"' | cut -d'"' -f4)"
echo "   Build time: $(date)"
echo ""

echo "Next steps:"
echo "  1. Run: ./scripts/validate-artifacts.sh"
echo "  2. Test by running: unzip -x out/<artifact>.zip && ./frappe-cafe/frappe-cafe"
