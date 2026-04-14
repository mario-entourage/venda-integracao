#!/usr/bin/env bash
# Stop hook: only remind about preview verification when UI/component files were changed.
# Skips reminder for: API routes, services, types, config files, firestore rules, etc.

CHANGED=$(
  git status --porcelain 2>/dev/null | awk '{print $2}'
  git diff --name-only HEAD~1..HEAD 2>/dev/null
)

if echo "$CHANGED" | grep -qE '^src/(components|hooks)/|^src/app/\(app\).*/page\.tsx$|^src/app/\(app\).*/layout\.tsx$'; then
  echo '{"systemMessage": "[Preview Required] UI files edited — verify changes if dev server is running per <verification_workflow>."}'
else
  exit 0
fi
