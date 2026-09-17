#!/usr/bin/env bash
set -euo pipefail

if ! command -v playwright-cli >/dev/null 2>&1; then
  echo "playwright-cli is required for recording: npm install -g @playwright/cli" >&2
  exit 1
fi

cdp_url="${JEV_CDP_URL:-http://127.0.0.1:9222}"
output="${JEV_VIDEO_OUTPUT:-artifacts/jev-rally-real-time.webm}"
width="${JEV_VIDEO_WIDTH:-1440}"
height="${JEV_VIDEO_HEIGHT:-900}"
mkdir -p "$(dirname "$output")"

playwright-cli attach --cdp="$cdp_url" >/dev/null
playwright-cli resize "$width" "$height" >/dev/null
playwright-cli video-start "$output" --size "${width}x${height}" >/dev/null

recording=true
stop_recording() {
  if [[ "$recording" == true ]]; then
    playwright-cli video-stop >/dev/null || true
    recording=false
  fi
}
trap stop_recording EXIT INT TERM

node src/cli.mjs --no-pause --cdp "$cdp_url" "$@"
playwright-cli video-chapter "Match complete" --description "Final score and measured API cost" --duration=3000 >/dev/null
sleep 3
stop_recording
printf 'Saved demo video to %s\n' "$output"

if command -v ffmpeg >/dev/null 2>&1; then
  mp4_output="${JEV_VIDEO_MP4_OUTPUT:-${output%.webm}.mp4}"
  ffmpeg -y -loglevel error -i "$output" \
    -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -movflags +faststart \
    "$mp4_output"
  printf 'Saved share-ready MP4 to %s\n' "$mp4_output"
fi
