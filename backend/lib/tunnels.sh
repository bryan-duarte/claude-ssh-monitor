# shellcheck shell=bash
# Local port forwards to a port on a host: action tunnel-open|tunnel-stop <label> <remote port>, tunnel-list [label].
# The local port is the remote port when it is free, else the next free one of 20; a remote port below 1024 maps
# 8000 up, because a normal user cannot listen there. The forward listens on 127.0.0.1 only and never uses -g.
# Each tunnel is one background "ssh -N -L" in its own process group, so it outlives this command. Its pid file
# $STATE_DIR/tunnels/<label>-<remote port> holds "<pid> <local port>"; ssh writes its errors to the same path + ".log".
TUNNEL_FIRST_UNPRIVILEGED_PORT=1024
TUNNEL_PRIVILEGED_PORT_OFFSET=8000
TUNNEL_LOCAL_PORT_CANDIDATES=20
TUNNEL_KEEPALIVE_SECONDS=15
TUNNEL_READY_CHECKS=25
TUNNEL_READY_CHECK_SECONDS=0.2

herdwatch_tunnels_dir() {
  printf '%s/tunnels' "$STATE_DIR"
}

herdwatch_tunnel_file() {
  printf '%s/%s-%s' "$(herdwatch_tunnels_dir)" "$1" "$2"
}

herdwatch_local_port_answers() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# A pid only counts when it is still our ssh for this forward, so a reused pid is never killed.
herdwatch_tunnel_pid_is_live() {
  local pid="$1" local_port="$2" remote_port="$3"
  herdwatch_is_positive_integer "$pid" || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -qE -- "(^| )-L 127\\.0\\.0\\.1:$local_port:localhost:$remote_port( |\$)"
}

# Prints "<pid> <local port>" of a tunnel whose ssh still runs.
herdwatch_live_tunnel() {
  local pid local_port _rest
  read -r pid local_port _rest 2>/dev/null <"$(herdwatch_tunnel_file "$1" "$2")" || return 1
  herdwatch_tunnel_pid_is_live "$pid" "$local_port" "$2" || return 1
  echo "$pid $local_port"
}

# ssh leads its own process group, so a ProxyCommand or ProxyJump child stops with it.
herdwatch_kill_tunnel() {
  kill -TERM -- "-$1" 2>/dev/null || kill -TERM "$1" 2>/dev/null
}

herdwatch_free_local_port() {
  local remote_port="$1" candidate last_candidate
  candidate="$remote_port"
  [ "$remote_port" -ge "$TUNNEL_FIRST_UNPRIVILEGED_PORT" ] || candidate=$((remote_port + TUNNEL_PRIVILEGED_PORT_OFFSET))
  last_candidate=$((candidate + TUNNEL_LOCAL_PORT_CANDIDATES - 1))
  [ "$last_candidate" -le "$HERDWATCH_MAX_PORT" ] || last_candidate="$HERDWATCH_MAX_PORT"
  while [ "$candidate" -le "$last_candidate" ]; do
    if ! herdwatch_local_port_answers "$candidate"; then
      echo "$candidate"
      return 0
    fi
    candidate=$((candidate + 1))
  done
  return 1
}

# set -m gives ssh its own process group, so a caller that stops the group of this command keeps the tunnel.
# Every fd of ssh points away from the caller, so the caller sees the end of this command's output at once.
herdwatch_start_tunnel_ssh() {
  local target="$1" local_port="$2" remote_port="$3" tunnel_file="$4"
  (
    set -m
    nohup ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval="$TUNNEL_KEEPALIVE_SECONDS" \
      -o ConnectTimeout="$SSH_TIMEOUT" -o ControlPath=none \
      -L "127.0.0.1:$local_port:localhost:$remote_port" -- "$target" </dev/null >"$tunnel_file.log" 2>&1 &
    echo "$! $local_port" >"$tunnel_file"
  )
}

herdwatch_tunnel_is_ready() {
  herdwatch_local_port_answers "$2" && kill -0 "$1" 2>/dev/null
}

herdwatch_wait_for_tunnel() {
  local pid="$1" local_port="$2" check=0
  while [ "$check" -lt "$TUNNEL_READY_CHECKS" ]; do
    herdwatch_tunnel_is_ready "$pid" "$local_port" && return 0
    kill -0 "$pid" 2>/dev/null || return 1
    sleep "$TUNNEL_READY_CHECK_SECONDS"
    check=$((check + 1))
  done
  herdwatch_tunnel_is_ready "$pid" "$local_port"
}

# A tunnel of a label removed from hosts.conf can still be stopped while its pid file is there.
herdwatch_has_tunnel_file() {
  [[ $1 =~ $HERDWATCH_LABEL_PATTERN ]] && herdwatch_is_port "$2" && [ -f "$(herdwatch_tunnel_file "$1" "$2")" ]
}

herdwatch_tunnel_opened() {
  herdwatch_action_succeeded "$1" "{\"local_port\":$2}"
}

herdwatch_open_tunnel() {
  local label="$1" remote_port="$2" tunnel_file live pid local_port index ssh_error
  tunnel_file=$(herdwatch_tunnel_file "$label" "$remote_port")
  if live=$(herdwatch_live_tunnel "$label" "$remote_port"); then
    herdwatch_tunnel_opened "The tunnel to :$remote_port on $label already runs." "${live#* }"
    return 0
  fi
  if ! local_port=$(herdwatch_free_local_port "$remote_port"); then
    herdwatch_action_failed port_busy "Local ports from $remote_port up are busy. Stop a program that holds one, then try again."
    return 0
  fi
  mkdir -p "$(herdwatch_tunnels_dir)"
  index=$(herdwatch_host_index "$label")
  herdwatch_start_tunnel_ssh "${HOST_TARGETS[$index]}" "$local_port" "$remote_port" "$tunnel_file"
  read -r pid _ <"$tunnel_file"
  if herdwatch_wait_for_tunnel "$pid" "$local_port"; then
    herdwatch_log tunnel_opened "label=$label remote_port=$remote_port local_port=$local_port"
    herdwatch_tunnel_opened "Opened :$remote_port on $label at 127.0.0.1:$local_port." "$local_port"
    return 0
  fi
  herdwatch_kill_tunnel "$pid"
  ssh_error=$(herdwatch_failure_detail "$tunnel_file.log")
  rm -f "$tunnel_file" "$tunnel_file.log"
  herdwatch_action_failed ssh_failed "ssh did not open the tunnel${ssh_error:+: $ssh_error}. Check that ssh ${HOST_TARGETS[$index]} works in a terminal." \
    "$ssh_error"
}

herdwatch_stop_tunnel() {
  local label="$1" remote_port="$2" tunnel_file live
  tunnel_file=$(herdwatch_tunnel_file "$label" "$remote_port")
  if live=$(herdwatch_live_tunnel "$label" "$remote_port"); then
    herdwatch_kill_tunnel "${live%% *}"
    herdwatch_log tunnel_stopped "label=$label remote_port=$remote_port"
  fi
  rm -f "$tunnel_file" "$tunnel_file.log"
  herdwatch_action_succeeded "Stopped the tunnel to :$remote_port on $label."
}

herdwatch_action_tunnel() {
  local name="$1" label="$2" remote_port="${3:-}"
  if ! herdwatch_is_port "$remote_port"; then
    herdwatch_action_failed bad_input "The port $remote_port is not a number from 1 to 65535."
    return 0
  fi
  herdwatch_take_action_lock "$label" || return 0
  if [ "$name" = tunnel-open ]; then
    herdwatch_open_tunnel "$label" "$remote_port"
  else
    herdwatch_stop_tunnel "$label" "$remote_port"
  fi
  herdwatch_unlock "action-$label"
}

# Lists the tunnels of one label, or of every label when the label is empty. A pid file whose ssh ended shows
# as "exited" until tunnel-stop removes it.
herdwatch_action_tunnel_list() {
  local only_label="$1" tunnel_file name label remote_port pid local_port _rest state separator="" tunnels_json=""
  for tunnel_file in "$(herdwatch_tunnels_dir)"/*; do
    [ -f "$tunnel_file" ] || continue
    name="${tunnel_file##*/}"
    case "$name" in *.log) continue ;; esac
    label="${name%-*}"
    remote_port="${name##*-}"
    [ -z "$only_label" ] || [ "$label" = "$only_label" ] || continue
    herdwatch_is_port "$remote_port" || continue
    read -r pid local_port _rest 2>/dev/null <"$tunnel_file"
    herdwatch_is_port "$local_port" || continue
    state=exited
    herdwatch_tunnel_pid_is_live "$pid" "$local_port" "$remote_port" && state=running
    tunnels_json="$tunnels_json$separator{\"label\":$(herdwatch_json_string "$label"),\"remotePort\":$remote_port,\"localPort\":$local_port,\"state\":\"$state\"}"
    separator=","
  done
  herdwatch_action_succeeded "Listed the tunnels." "{\"tunnels\":[$tunnels_json]}"
}
