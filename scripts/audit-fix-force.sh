#!/usr/bin/env bash
set -euo pipefail

echo "This script will create a branch 'chore/audit-fix-force' and run npm audit fix --force."
echo "It may upgrade major versions and break the build. Run only in a clean working tree."

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree not clean. Please commit or stash changes before running this script." >&2
  exit 1
fi

git checkout -b chore/audit-fix-force

echo "Running: npm audit fix --force"
npm audit fix --force

echo "Cleaning node_modules and lockfile to ensure deterministic install..."
rm -rf node_modules package-lock.json
npm install

echo "Running build to verify..."
if npm run build; then
  echo "Build succeeded. Start dev server to manual-test (you can stop it later with Ctrl+C)."
  npm run dev
else
  echo "Build failed after audit fix --force. Inspect errors, consider reverting the branch:" >&2
  echo "  git checkout main && git branch -D chore/audit-fix-force" >&2
  exit 2
fi

echo "Done. If build works, commit the lockfile and package.json changes:" 
echo "  git add package-lock.json package.json"
echo "  git commit -m 'chore: apply npm audit fix --force (test branch)'"
