#!/usr/bin/env bash
# Deploy the resolve-place Edge Function and set its Google key secret.
# Reads GOOGLE_MAPS_API_KEY from the repo-root .env at runtime (never echoed).
# Requires a prior `npx supabase login` (or SUPABASE_ACCESS_TOKEN in the env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_REF="svrcpzerrbxnzywddyzz"

set -a
source "$REPO_ROOT/.env"
set +a

if [ -z "${GOOGLE_MAPS_API_KEY:-}" ]; then
  echo "GOOGLE_MAPS_API_KEY missing from .env" >&2
  exit 1
fi

cd "$REPO_ROOT/app"

npx -y supabase@latest secrets set "GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY" \
  --project-ref "$PROJECT_REF"

# --no-verify-jwt: new-style publishable keys aren't JWTs; the function
# enforces owner-only auth itself via auth.getUser().
npx -y supabase@latest functions deploy resolve-place \
  --project-ref "$PROJECT_REF" --no-verify-jwt --use-api

echo "resolve-place deployed."
