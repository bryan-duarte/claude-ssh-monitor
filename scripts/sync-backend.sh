#!/usr/bin/env bash
# Shows how backend/ differs from a herdwatch checkout, to carry upstream fixes over by hand.
# usage: scripts/sync-backend.sh <herdwatch checkout> [path inside backend/ to limit the diff]
# Upstream bin/herdwatch is compared with backend/bin/ssh-monitor. Files that exist only here
# (lib/tunnels.sh, lib/probe/sessions.sh) show as "Only in". Exit code: 0 when equal, 1 when they differ.
set -u

usage() {
  echo "usage: $0 <herdwatch checkout> [path inside backend/]" >&2
  exit 2
}

[ "$#" -ge 1 ] || usage
upstream="$1/mods/herdwatch"
only_path="${2:-}"
backend="$(CDPATH='' cd -- "$(dirname -- "$0")/../backend" && pwd)"
[ -d "$upstream/lib" ] || { echo "$0: $upstream/lib not found" >&2; exit 2; }

# A copy of upstream with the binary under its name here, so diff pairs the two.
mapped="$(mktemp -d)"
trap 'rm -rf "$mapped"' EXIT
cp -R "$upstream/bin" "$upstream/lib" "$upstream/examples" "$mapped/"
[ -e "$mapped/bin/herdwatch" ] && mv "$mapped/bin/herdwatch" "$mapped/bin/ssh-monitor"

status=0
for part in bin lib examples; do
  case "$only_path" in '' | "$part" | "$part"/*) ;; *) continue ;; esac
  target="${only_path:-$part}"
  diff -ru "$mapped/$target" "$backend/$target" | sed "s|$mapped/|herdwatch/|g; s|$backend/|backend/|g"
  [ "${PIPESTATUS[0]}" = 0 ] || status=1
done
exit "$status"
