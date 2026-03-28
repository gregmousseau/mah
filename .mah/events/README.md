# Event Stream

Each `.jsonl` file is a chronological event log for the build session.
Events are append-only, one JSON object per line.
Designed for Remotion replay — each event has timestamp, actor, phase, and content.
