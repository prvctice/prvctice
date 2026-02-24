#!/usr/bin/env bash
set -euo pipefail

# publish-oss.sh — Create a clean copy of the codebase for the public OSS repo.
# Usage: ./scripts/publish-oss.sh [target-directory]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OSSIGNORE="$PROJECT_ROOT/.ossignore"
TARGET="${1:-$PROJECT_ROOT/../prvctice-public}"

if [ -d "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "Error: Target directory '$TARGET' exists and is not empty."
  echo "Remove it first or choose a different path."
  exit 1
fi

if [ ! -f "$OSSIGNORE" ]; then
  echo "Error: .ossignore not found at $OSSIGNORE"
  exit 1
fi

echo "Publishing clean OSS copy..."
echo "  Source: $PROJECT_ROOT"
echo "  Target: $TARGET"
echo ""

mkdir -p "$TARGET"

# Build rsync exclude list from .ossignore
EXCLUDES=()
while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  EXCLUDES+=(--exclude "$line")
done < "$OSSIGNORE"

rsync -a \
  "${EXCLUDES[@]}" \
  "$PROJECT_ROOT/" \
  "$TARGET/"

# Ensure canon.example.json is included as the starter
if [ -f "$PROJECT_ROOT/canon.example.json" ]; then
  cp "$PROJECT_ROOT/canon.example.json" "$TARGET/canon.example.json"
fi

echo ""
echo "Done! Clean copy created at: $TARGET"
echo ""
echo "=== Pre-publish checklist ==="
echo ""
echo "  1. ROTATE ALL API KEYS that ever appeared in git history:"
echo "     - Anthropic (sk-ant-...)"
echo "     - OpenRouter (sk-or-...)"
echo "     - OpenAI (sk-proj-...)"
echo "     - YouTube API key"
echo "     - Tumblr API key"
echo "     - Wikimedia credentials"
echo "     - SESSION_SECRET"
echo "     - Apple notarization credentials"
echo ""
echo "  2. VERIFY no secrets leaked:"
echo "     grep -r 'sk-ant\|sk-or\|sk-proj\|AIzaSy' $TARGET"
echo ""
echo "  3. VERIFY excluded files are absent:"
echo "     ls $TARGET/.env $TARGET/canon.json $TARGET/banned.json $TARGET/.localstorage.json 2>&1"
echo ""
echo "  4. VERIFY required files present:"
echo "     ls $TARGET/LICENSE $TARGET/NOTICE $TARGET/README.md $TARGET/CONTRIBUTING.md $TARGET/SECURITY.md"
echo ""
echo "  5. TEST the clean copy builds:"
echo "     cd $TARGET && npm install && npm run web:dev"
echo ""
echo "  6. REVIEW public/images/ for licensing (fishLoop.mp4, quickcustom04.jpg)"
echo ""
echo "  7. When ready: cd $TARGET && git init && git add -A && git commit -m 'Initial open source release'"
echo ""
