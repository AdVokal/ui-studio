#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="/tmp/dashboard-studio.pids"
MAIN="$ROOT/ui-base"
EDITOR="$ROOT/timeline-editor"

[ -f "$PIDFILE" ] && kill $(cat "$PIDFILE") 2>/dev/null && rm "$PIDFILE"

cd "$MAIN" && npm run dev &
echo $! >> "$PIDFILE"
cd "$MAIN" && npm run remotion:studio &
echo $! >> "$PIDFILE"
cd "$EDITOR" && npm run dev &
echo $! >> "$PIDFILE"

sleep 4
open -a "Google Chrome" http://localhost:5173
open -a "Google Chrome" http://localhost:3000
open -a "Google Chrome" http://localhost:5174
echo "Started. Run ./stop-all.sh to stop."
