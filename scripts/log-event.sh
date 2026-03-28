#!/bin/bash
# Usage: ./scripts/log-event.sh <actor> <type> <phase> <summary> [detail_file]
# Appends a JSON event to the active session log

EVENTS_DIR="$(dirname "$0")/../.mah/events"
SESSION_FILE="$EVENTS_DIR/session-$(date +%Y%m%d).jsonl"

ACTOR="$1"
TYPE="$2"      # spawn, output, decision, screenshot, milestone, error
PHASE="$3"     # contract, dev, qa, metrics, human
SUMMARY="$4"
DETAIL_FILE="$5"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
LOCAL_TIME=$(date +%H:%M:%S)

# Read detail from file if provided
DETAIL=""
if [ -n "$DETAIL_FILE" ] && [ -f "$DETAIL_FILE" ]; then
  DETAIL=$(cat "$DETAIL_FILE" | jq -Rs .)
else
  DETAIL="null"
fi

# Build JSON event
cat >> "$SESSION_FILE" << EOF
{"ts":"$TIMESTAMP","local":"$LOCAL_TIME","actor":"$ACTOR","type":"$TYPE","phase":"$PHASE","summary":"$SUMMARY","detail":$DETAIL}
EOF

echo "✓ Logged: [$LOCAL_TIME] $ACTOR/$TYPE — $SUMMARY"
