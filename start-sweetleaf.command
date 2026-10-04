#!/bin/bash
# macOS: double-click to start Sweetleaf Suite.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  echo ""
  open "https://nodejs.org/en/download" 2>/dev/null
  read -r -p "Press Enter to close…"
  exit 1
fi
node scripts/launch.mjs || read -r -p "Press Enter to close…"
