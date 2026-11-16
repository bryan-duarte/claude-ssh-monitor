#!/usr/bin/env bash
# Copies the agent, program and UI marks into assets/, then renders each SVG mark as a PNG for the terminal Image.
# usage: scripts/build-icons.sh <herdwatch-checkout> [herdr-icons-folder]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERDWATCH_ICONS="${1:?usage: build-icons.sh <herdwatch-checkout> [herdr-icons-folder]}/mods/herdwatch/icons"
HERDR_ICONS="${2:-$HOME/.config/herdr-app/icons}"
ASSETS="$REPO_ROOT/assets"
PNG_PIXELS=64
TINT_COLOR="#c0caf5"

HERDR_AGENT_MARKS="claude codex cursor opencode gemini antigravity amp copilot crush kimi kiro grok pi pig qoder hermes mastracode dsh-tui git"
HERDR_PROGRAM_MARKS="node next python fastapi django-admin docker psql redis-cli mongosh mysql go cargo electron kubectl ssh vite esbuild webpack turbo bun deno flask ruby podman nginx caddy java ollama git tmux nvim vim"
PICTURE_AGENT_MARKS=" claude codex antigravity amp crush kimi kiro pig devin openhands omp "

copy_marks() {
  local source_folder="$1" target_folder="$2" keys="$3" key
  for key in $keys; do
    cp "$source_folder/$key.svg" "$target_folder/$key.svg"
  done
}

render_png() {
  local svg_file="$1" png_file="$2" is_tinted="$3" sized_svg
  sized_svg="${png_file%.png}.sized.svg"
  if [ "$is_tinted" = yes ]; then
    sed -E "s/ (width|height)=\"[^\"]*\"//; s/ (width|height)=\"[^\"]*\"//; s/<svg([^>]*) fill=\"[^\"]*\"/<svg\1/; s/<svg /<svg width=\"$PNG_PIXELS\" height=\"$PNG_PIXELS\" fill=\"$TINT_COLOR\" /; s/currentColor/$TINT_COLOR/g" "$svg_file" >"$sized_svg"
  else
    sed -E "s/ (width|height)=\"[^\"]*\"//; s/ (width|height)=\"[^\"]*\"//; s/<svg /<svg width=\"$PNG_PIXELS\" height=\"$PNG_PIXELS\" /" "$svg_file" >"$sized_svg"
  fi
  swift "$REPO_ROOT/scripts/svg-to-png.swift" "$sized_svg" "$png_file" "$PNG_PIXELS"
  rm -f "$sized_svg"
}

mkdir -p "$ASSETS/agents" "$ASSETS/programs" "$ASSETS/ui" "$ASSETS/png/agents" "$ASSETS/png/programs"

copy_marks "$HERDR_ICONS" "$ASSETS/agents" "$HERDR_AGENT_MARKS"
copy_marks "$HERDR_ICONS" "$ASSETS/programs" "$HERDR_PROGRAM_MARKS"
cp "$HERDR_ICONS/LICENSE-LobeHub.txt" "$HERDR_ICONS/LICENSE-Lucide.txt" "$ASSETS/"
cp "$HERDR_ICONS/LICENSES.md" "$ASSETS/LICENSES-herdr-icons.md"
cp "$HERDWATCH_ICONS"/agents/*.svg "$HERDWATCH_ICONS"/agents/*.png "$ASSETS/agents/"
cp "$HERDWATCH_ICONS/agents/LICENSES.md" "$ASSETS/agents/LICENSES.md"
cp "$HERDWATCH_ICONS"/programs/*.svg "$ASSETS/programs/"
cp "$HERDWATCH_ICONS/programs/LICENSES.md" "$ASSETS/programs/LICENSES.md"
cp "$HERDWATCH_ICONS"/ui/*.svg "$HERDWATCH_ICONS/ui/LICENSE-Lucide.txt" "$ASSETS/ui/"

for svg_file in "$ASSETS"/agents/*.svg; do
  key="$(basename "$svg_file" .svg)"
  is_tinted=yes
  case "$PICTURE_AGENT_MARKS" in *" $key "*) is_tinted=no ;; esac
  render_png "$svg_file" "$ASSETS/png/agents/$key.png" "$is_tinted"
done
for svg_file in "$ASSETS"/programs/*.svg; do
  render_png "$svg_file" "$ASSETS/png/programs/$(basename "$svg_file" .svg).png" yes
done
echo "icons built in $ASSETS"
