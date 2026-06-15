#!/bin/bash
set -euo pipefail

# Install Node dependencies so tests, linters, and the dev server are ready
# in Claude Code on the web sessions. Skip locally (devs manage their own deps).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Use `npm install` (not `npm ci`) so the cached container state is reused
# across sessions and the install stays fast.
npm install
