#!/usr/bin/env bash
# Build the admin app and publish it to GitHub Pages at /admin/ on main.
# main's index.html (the live static site) is never touched — this only
# replaces the admin/ directory, via a temporary worktree of origin/main.
# Fails loudly if main moved between fetch and push; just rerun.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

npm --prefix app/web run build

git fetch origin main
WT="$(mktemp -d)"
git worktree add --detach "$WT" origin/main
trap 'git worktree remove --force "$WT" 2>/dev/null || true' EXIT

rm -rf "$WT/admin"
cp -R app/web/dist "$WT/admin"

cd "$WT"
git add admin
if git diff --cached --quiet; then
  echo "admin/ unchanged — nothing to deploy."
  exit 0
fi
git commit -m "Deploy admin app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin HEAD:main

echo "Deployed. Live in ~30s at https://k-mizrahi.github.io/nyc-food/admin/"
