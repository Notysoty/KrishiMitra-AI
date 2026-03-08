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
gh secret set JWT_SECRET             --repo "$REPO" --body "${JWT_SECRET:-krishimitra-dev-secret-key-change-in-production}"
gh secret set DATABASE_URL           --repo "$REPO" --body "${DATABASE_URL:-}"

# ── VAPID (Web Push) ─────────────────────────────────────────────────────────
gh secret set VAPID_PUBLIC_KEY       --repo "$REPO" --body "BJZUTttX1bcyIoutQMi5mhnK5eTRmTFDv2ImAGPvsp3stmPmk1vJBSvZYWPSV9XF9WVgvcueC16j4l9gxky9Z_c"
gh secret set VAPID_PRIVATE_KEY      --repo "$REPO" --body "VAPID_PRIVATE_KEY_REMOVED"

# ── Frontend env ─────────────────────────────────────────────────────────────
# Set these to real values when available:
gh secret set REACT_APP_API_URL                 --repo "$REPO" --body "${REACT_APP_API_URL:-http://localhost:3000}"
gh secret set REACT_APP_OPENWEATHER_API_KEY     --repo "$REPO" --body "${REACT_APP_OPENWEATHER_API_KEY:-}"
gh secret set REACT_APP_DATA_GOV_API_KEY        --repo "$REPO" --body "${REACT_APP_DATA_GOV_API_KEY:-}"

# ── Deployment targets (fill in after CDK deploy) ────────────────────────────
# gh secret set FRONTEND_S3_BUCKET            --repo "$REPO" --body "krishimitra-frontend-XXXX"
# gh secret set CLOUDFRONT_DISTRIBUTION_ID   --repo "$REPO" --body "EXXXXXXXXXX"

echo ""
echo "✅ Secrets set. To see them: gh secret list --repo $REPO"
echo ""
echo "Remaining manual steps:"
echo "  1. After CDK deploy, set FRONTEND_S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID"
echo "  2. Set DATABASE_URL to the RDS endpoint from CDK outputs"
echo "  3. Set REACT_APP_API_URL to the API Gateway URL from CDK outputs"
