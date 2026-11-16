# shellcheck shell=bash
SNAPSHOT_FORMAT_VERSION=3

herdwatch_json_string() {
  HERDWATCH_JSON_TEXT="$1" awk 'BEGIN { text = ENVIRON["HERDWATCH_JSON_TEXT"]; gsub(/\\/, "\\\\", text); gsub(/"/, "\\\"", text); printf "\"%s\"", text }'
}

herdwatch_worktrees_sorted_by_size() {
  local worktrees_file="$1" tab
  tab=$(printf '\t')
  [ -r "$worktrees_file" ] || return 0
  sed -n "1,/^\\$WORKTREES_SECTION\$/p" "$worktrees_file"
  herdwatch_worktree_rows "$worktrees_file" | sort -t "$tab" -k1,1 -rn
}

herdwatch_print_host_json() {
  local label="$1" target="$2" record_file docker_file host_json
  record_file=$(herdwatch_record_file "$label")
  [ -r "$record_file" ] || record_file=/dev/null
  docker_file=$(herdwatch_docker_file "$label")
  [ -r "$docker_file" ] || docker_file=/dev/null
  host_json=$(awk -v mode=host -v label="$label" -v target="$target" -v pins="$(herdwatch_pins_of_label "$label")" \
    -f "$HERDWATCH_ROOT/lib/snapshot.awk" "$record_file")
  printf '%s,"worktrees":' "${host_json%\}}"
  herdwatch_worktrees_sorted_by_size "$(herdwatch_worktrees_file "$label")" |
    awk -v mode=worktrees -f "$HERDWATCH_ROOT/lib/snapshot.awk"
  printf ',"docker":'
  awk -v mode=docker -v docker_setting="$DOCKER" -f "$HERDWATCH_ROOT/lib/snapshot.awk" "$docker_file"
  printf '}'
}

herdwatch_print_alerts_json() {
  local outbox taken_outbox
  outbox=$(herdwatch_alert_outbox)
  taken_outbox="$outbox.$$"
  mv "$outbox" "$taken_outbox" 2>/dev/null || : >"$taken_outbox"
  awk -v mode=alerts -f "$HERDWATCH_ROOT/lib/snapshot.awk" "$taken_outbox"
  rm -f "$taken_outbox"
}

herdwatch_json_bool() {
  if [ "$1" = on ]; then echo true; else echo false; fi
}

herdwatch_print_settings_json() {
  printf '{"warn":%s,"crit":%s,"top_n":%s,"ssh_timeout":%s,"pane_refresh":%s,"stale_seconds":%s,"worktree_interval":%s,"worktree_timeout":%s,"docker_interval":%s,"alerts":%s,"docker":%s}' \
    "$WARN" "$CRIT" "$TOP_N" "$SSH_TIMEOUT" "$PANE_REFRESH" "$STALE_SECONDS" "$WORKTREE_INTERVAL" "$WORKTREE_TIMEOUT" \
    "$DOCKER_INTERVAL" "$(herdwatch_json_bool "$ALERTS")" "$(herdwatch_json_bool "$DOCKER")"
}

herdwatch_print_collector_json() {
  printf '{"state":%s,"busy_since":%s}' "$(herdwatch_json_string "$COLLECTOR_STATE")" "${COLLECTOR_BUSY_SINCE:-null}"
}

herdwatch_due_json() {
  if "$@"; then echo true; else echo false; fi
}

# With --keep-alerts the alert outbox stays for the next full snapshot and the alerts list is empty.
herdwatch_print_snapshot() {
  local generated_at="$1" alerts_mode="${2:-}" index=0 separator=""
  printf '{"version":%s,"generated_at":%s,"hosts_file":%s,"settings_file":%s,"pins_file":%s,"settings":' \
    "$SNAPSHOT_FORMAT_VERSION" "$generated_at" "$(herdwatch_json_string "$CONFIG_DIR/hosts.conf")" \
    "$(herdwatch_json_string "$CONFIG_DIR/settings.conf")" "$(herdwatch_json_string "$(herdwatch_pins_file)")"
  herdwatch_print_settings_json
  printf ',"hosts":['
  while [ "$index" -lt "$HOST_COUNT" ]; do
    printf '%s' "$separator"
    herdwatch_print_host_json "${HOST_LABELS[$index]}" "${HOST_TARGETS[$index]}"
    separator=","
    index=$((index + 1))
  done
  printf '],"worktrees_due":%s,"docker_due":%s,"collector":' \
    "$(herdwatch_due_json herdwatch_worktrees_are_due)" "$(herdwatch_due_json herdwatch_docker_is_due)"
  herdwatch_print_collector_json
  printf ',"problems":'
  herdwatch_print_problems_json
  printf ',"alerts":'
  if [ "$alerts_mode" = --keep-alerts ]; then
    printf '[]'
  else
    herdwatch_print_alerts_json
  fi
  printf '}\n'
}

herdwatch_generated_at_file() {
  printf '%s/snapshot_generated_at' "$STATE_DIR"
}

herdwatch_save_generated_at() {
  local generated_at_file
  generated_at_file=$(herdwatch_generated_at_file)
  echo "$1" >"$generated_at_file.$$.tmp" && mv -f "$generated_at_file.$$.tmp" "$generated_at_file"
}

# The time of the last full snapshot, so a cached snapshot shows how late the leader's poll is.
herdwatch_saved_generated_at() {
  local generated_at=""
  read -r generated_at 2>/dev/null <"$(herdwatch_generated_at_file)"
  if herdwatch_is_positive_integer "$generated_at"; then echo "$generated_at"; else date +%s; fi
}

herdwatch_snapshot() {
  local generated_at
  herdwatch_seed_config
  herdwatch_load_settings
  herdwatch_load_hosts
  herdwatch_load_pins
  herdwatch_collect
  generated_at=$(date +%s)
  herdwatch_save_generated_at "$generated_at"
  herdwatch_print_snapshot "$generated_at"
}

# Reads the collector state from the poll lock without taking it, so a running poll shows as busy.
herdwatch_read_collector_state() {
  COLLECTOR_STATE=ran
  COLLECTOR_BUSY_SINCE=""
  [ -d "$STATE_DIR/poll-lock.d" ] || return 0
  herdwatch_lock_is_stale "$STATE_DIR/poll-lock.d" "$POLL_LOCK_STALE_SECONDS" && return 0
  COLLECTOR_STATE=busy
  COLLECTOR_BUSY_SINCE=$(cat "$STATE_DIR/poll-lock.d/taken_at" 2>/dev/null)
}

# Prints the snapshot from the stored records with no ssh, for the sessions that do not hold the poll lease.
# The alert outbox stays for the full snapshot, so each alert is delivered once.
herdwatch_cached_snapshot() {
  herdwatch_seed_config
  herdwatch_load_settings
  herdwatch_load_hosts
  herdwatch_load_pins
  herdwatch_read_collector_state
  herdwatch_print_snapshot "$(herdwatch_saved_generated_at)" --keep-alerts
}
