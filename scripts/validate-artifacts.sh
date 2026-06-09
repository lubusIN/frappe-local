#!/usr/bin/env bash
# Validate Local Bench build artifacts
# Usage: ./scripts/validate-artifacts.sh

set -e

echo "✅ Validating Build Artifacts"
echo "=============================="
echo ""

# Artifacts can be in either location:
# - out/ (if copied/symlinked)
# - out/make/ (default Electron Forge location)

ARTIFACT_DIRS=("./out/make" "./out")
ARTIFACT_DIR=""
VALID_COUNT=0
INVALID_COUNT=0

# Find the artifacts directory
for dir in "${ARTIFACT_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    if find "$dir" -name "*.zip" -type f 2>/dev/null | grep -q .; then
      ARTIFACT_DIR="$dir"
      break
    fi
  fi
done

if [ -z "$ARTIFACT_DIR" ]; then
  echo "❌ No artifacts found. Run 'npm run make' first."
  echo ""
  echo "Build commands:"
  echo "  npm run build   - Package the app locally"
  echo "  npm run make    - Create platform distributables"
  exit 1
fi

echo "🔍 Scanning: $ARTIFACT_DIR"
echo ""

# Find all ZIP artifacts
ZIP_FILES=$(find "$ARTIFACT_DIR" -name "*.zip" -type f 2>/dev/null)

if [ -z "$ZIP_FILES" ]; then
  echo "❌ No ZIP artifacts found in $ARTIFACT_DIR"
  exit 1
fi

# Validate each artifact
while IFS= read -r ZIP_FILE; do
  FILENAME=$(basename "$ZIP_FILE")
  FILESIZE=$(du -h "$ZIP_FILE" | cut -f1)
  
  echo "📦 Checking: $FILENAME ($FILESIZE)"
  
  # Test ZIP integrity
  if unzip -t "$ZIP_FILE" > /dev/null 2>&1; then
    echo "   ✅ Archive integrity: OK"
    
    # Check for expected app directory
    if unzip -l "$ZIP_FILE" | grep -q "Local Bench"; then
      echo "   ✅ App structure: OK"

      REQUIRED_BINARIES=("Resources/bin/podman" "Resources/bin/docker-compose" "Resources/bin/caddy")
      if [[ "$FILENAME" == *"darwin"* ]]; then
        REQUIRED_BINARIES+=("Resources/bin/podman-real" "Resources/bin/gvproxy" "Resources/bin/vfkit")
      fi

      MISSING_BINARY=0
      for binary in "${REQUIRED_BINARIES[@]}"; do
        if ! unzip -l "$ZIP_FILE" | grep -q "$binary"; then
          echo "   ❌ Missing packaged runtime binary: $binary"
          MISSING_BINARY=1
        fi
      done

      if [ "$MISSING_BINARY" -eq 0 ]; then
        echo "   ✅ Runtime binaries: OK"
        VALID_COUNT=$((VALID_COUNT + 1))
      else
        INVALID_COUNT=$((INVALID_COUNT + 1))
      fi
    else
      echo "   ⚠️  App structure: Unexpected (no 'Local Bench' directory)"
      INVALID_COUNT=$((INVALID_COUNT + 1))
    fi
  else
    echo "   ❌ Archive integrity: FAILED"
    INVALID_COUNT=$((INVALID_COUNT + 1))
  fi
  
  echo ""
done <<< "$ZIP_FILES"

# Summary
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo "✅ Valid artifacts: $VALID_COUNT"
echo "❌ Invalid artifacts: $INVALID_COUNT"
echo ""

if [ $INVALID_COUNT -eq 0 ] && [ $VALID_COUNT -gt 0 ]; then
  echo "✅ All artifacts are valid!"
  echo ""
  echo "📂 Artifacts ready for testing:"
  find "$ARTIFACT_DIR" -name "*.zip" -type f | while read -r artifact; do
    SIZE=$(du -h "$artifact" | cut -f1)
    echo "   $(basename "$artifact") ($SIZE)"
  done
  echo ""
  echo "Next steps:"
  echo "  1. Extract an artifact: unzip -x '<artifact>.zip'"
  echo "  2. Run smoke tests manually"
  echo "  3. Check app launches without errors"
  echo "  4. Verify core flows work (Dashboard, Console, Import/Export)"
  exit 0
else
  echo "❌ Artifact validation failed!"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check build logs: npm run make"
  echo "  2. Verify Electron Forge is properly configured"
  echo "  3. Ensure no build errors occurred"
  exit 1
fi
