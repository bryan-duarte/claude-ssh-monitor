# shellcheck shell=sh
# Prints the --sessions-- section: the Claude Code sessions that ssh-monitor reported on this host.
# Each session file is flat JSON: {"cwd":"/x","state":"working|blocked|idle","updated_at":<epoch seconds>}.
# Row: cwd, state, updated_at. A file not updated in the last 600 s is skipped. The awk is a field match on flat
# JSON, not a full parser: it undoes \" \\ and \/, and turns other escapes into a space or "?".
sessions_max_age_seconds=600

sessions_probe() {
  sessions_dir="$HOME/.local/state/ssh-monitor/sessions"
  echo "--sessions--"
  [ -d "$sessions_dir" ] || return 0
  set -- "$sessions_dir"/*.json
  [ -f "$1" ] || return 0
  awk -v now="$(date +%s)" -v max_age="$sessions_max_age_seconds" '
    function string_field(key,   escaped, position, character, output) {
      if (!match(text, "\"" key "\"[ \t]*:[ \t]*\"([^\"\\\\]|\\\\.)*\"")) return ""
      escaped = substr(text, RSTART, RLENGTH)
      sub(/^"[^"]*"[ \t]*:[ \t]*"/, "", escaped)
      escaped = substr(escaped, 1, length(escaped) - 1)
      output = ""
      for (position = 1; position <= length(escaped); position++) {
        character = substr(escaped, position, 1)
        if (character == "\\") {
          position++
          character = substr(escaped, position, 1)
          if (character == "u") { character = "?"; position += 4 }
          else if (character !~ /["\\\/]/) character = " "
        }
        output = output character
      }
      return output
    }
    function number_field(key) {
      if (!match(text, "\"" key "\"[ \t]*:[ \t]*[0-9]+")) return ""
      value = substr(text, RSTART, RLENGTH)
      sub(/^"[^"]*"[ \t]*:[ \t]*/, "", value)
      return value
    }
    function print_session(   cwd, state, updated_at) {
      cwd = string_field("cwd")
      state = string_field("state")
      updated_at = number_field("updated_at")
      gsub(/[\t\n\r]/, " ", cwd)
      if (cwd == "" || updated_at == "" || now - updated_at > max_age) return
      if (state != "working" && state != "blocked" && state != "idle") return
      printf "%s\t%s\t%s\n", cwd, state, updated_at
    }
    FNR == 1 && NR > 1 { print_session(); text = "" }
    { text = text $0 }
    END { if (NR > 0) print_session() }
  ' "$@"
}
