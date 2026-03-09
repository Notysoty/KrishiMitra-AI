#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KrishiMitra-AI — GitHub Secrets Setup
# Run this once to push all required secrets to your GitHub repo.
#
# Prerequisites:
#   gh auth login   (GitHub CLI, https://cli.github.com)
#   aws configure   (AWS CLI configured)
#
# Usage:
#   chmod +x scripts/setup-github-secrets.sh
#   ./scripts/setup-github-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="Notysoty/KrishiMitra-AI"

echo "Setting GitHub Actions secrets for $REPO ..."

# ── AWS Credentials ──────────────────────────────────────────────────────────
gh secret set AWS_ACCESS_KEY_ID      --repo "$REPO" --body "${AWS_ACCESS_KEY_ID:-}"
gh secret set AWS_SECRET_ACCESS_KEY  --repo "$REPO" --body "${AWS_SECRET_ACCESS_KEY:-}"
gh secret set AWS_ACCOUNT_ID         --repo "$REPO" --body "730335204711"

# ── Backend secrets ──────────────────────────────────────────────────────────
gh secret set JWT_SECRET             --repo "$REPO" --body "${JWT_SECRET:?JWT_SECRET env var is required}"
gh secret set DATABASE_URL           --repo "$REPO" --body "${DATABASE_URL:-}"

# ── VAPID (Web Push) ─────────────────────────────────────────────────────────
# Public key is non-sensitive; private key must be passed via env var
gh secret set VAPID_PUBLIC_KEY       --repo "$REPO" --body "BJZUTttX1bcyIoutQMi5mhnK5eTRmTFDv2ImAGPvsp3stmPmk1vJBSvZYWPSV9XF9WVgvcueC16j4l9gxky9Z_c"
gh secret set VAPID_PRIVATE_KEY      --repo "$REPO" --body "${VAPID_PRIVATE_KEY:?VAPID_PRIVATE_KEY env var is required}"

# ── Frontend env ─────────────────────────────────────────────────────────────
gh secret set REACT_APP_API_URL                 --repo "$REPO" --body "https://85vaw3znj3.execute-api.us-east-1.amazonaws.com/v1"
gh secret set REACT_APP_OPENWEATHER_API_KEY     --repo "$REPO" --body "${REACT_APP_OPENWEATHER_API_KEY:-}"
gh secret set REACT_APP_DATA_GOV_API_KEY        --repo "$REPO" --body "${REACT_APP_DATA_GOV_API_KEY:-}"

# ── Deployment targets ───────────────────────────────────────────────────────
gh secret set FRONTEND_S3_BUCKET            --repo "$REPO" --body "krishimitra-frontend-730335204711"
gh secret set CLOUDFRONT_DISTRIBUTION_ID   --repo "$REPO" --body "E2NDHWDKFHKN77"

echo ""
echo "✅ Secrets set. To see them: gh secret list --repo $REPO"
echo ""
echo "Remaining manual step:"
echo "  1. Set DATABASE_URL once you retrieve the DB password from Secrets Manager"
