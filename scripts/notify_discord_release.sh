#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <release_tag> <release_description>"
  exit 1
fi

if [[ -z "${DISCORD_WEBHOOK_URL:-}" ]]; then
  echo "DISCORD_WEBHOOK_URL is required"
  exit 1
fi

release_tag="$1"
release_description="$2"

message_template=${DISCORD_MESSAGE_TEMPLATE:-$'# Nueva versión {tag} disponible!\n\n{description}\n\nMas información sobre esta versión en: https://github.com/androettop/nivel21/releases/tag/{tag}'}
message="${message_template//\{tag\}/$release_tag}"
message="${message//\{description\}/$release_description}"

payload="$(python3 -c 'import json,sys; print(json.dumps({"content": sys.stdin.read()}))' <<< "$message")"

curl -fsSL -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$payload"

echo "Discord notification sent"
