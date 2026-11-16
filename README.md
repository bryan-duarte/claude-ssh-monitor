# ssh-monitor

A btop-style monitor of the SSH hosts where your coding agents run, drawn inside Claude Code. It is a Claude Code mod (a hooks module) built from [herdwatch](https://github.com/bryan-duarte/herdwatch), the Herdr mod.

- **Band above the prompt**: each host with CPU and memory meters, `!` at WARN and `!!` at CRIT, `✕` when a host is down. The `□`/`◧` button (hotkey `m` while the band has the keyboard) opens the console.
- **Console pane** (`/ssh-monitor`): six tabs — `overview`, `agents`, `ports`, `worktrees`, `docker` and `procs` — with braille history charts on the terminal and SVG charts on the desktop app.
- **Actions** with a confirm dialog: kill a process tree, remove a worktree (and its branch), stop or remove a container, prune Docker data. Pin a port, or open it in the browser through an SSH tunnel on `127.0.0.1`.
- **Alerts** as toasts: a host that runs hot, or a pinned port that stops.
- **A read-only tool for Claude**, `mcp__ssh-monitor__hosts`, so Claude can answer "which host is out of memory?".

## Install

At the prompt of a terminal session:

```
/plugin install ssh-monitor --marketplace bryan-duarte/ssh-monitor
```

From a shell:

```bash
claude plugin install ssh-monitor --marketplace bryan-duarte/ssh-monitor
```

For development, load the folder directly:

```bash
claude --plugin-dir ~/Documents/proyectos/personales/ssh-monitor
```

## Setup

The first poll writes three files to `~/.config/ssh-monitor/`:

- `hosts.conf` — one `label  ssh-target` line per host. The host must accept a key login with no prompt (`BatchMode`).
- `settings.conf` — `WARN`, `CRIT`, `TOP_N`, `SSH_TIMEOUT`, `STALE_SECONDS`, worktree and Docker intervals, `ALERTS`, `DOCKER`.
- `pins.conf` — the ports that stay at the top of the ports tab and raise an alert when they stop.

Remote hosts need no extra tools: the probe is POSIX `sh` and `awk`. Records and the shared chart history live in `~/.local/state/ssh-monitor/`.

## How it works

- `backend/` is the herdwatch bash backend with new paths. It polls every host over one SSH master per host, every 5 s.
- Many Claude Code sessions share one poller: a lease file (`poller.lease`, 12 s) picks the session that runs `snapshot`. The other sessions run `snapshot --cached`, which reads the records with no SSH.
- Each session writes `~/.local/state/ssh-monitor/sessions/<id>.json` with its folder and state. When Claude Code runs on a host that you watch, the agents tab shows that session as `working`, `needs you` or `idle`.
- Every action goes through `backend/bin/ssh-monitor action`, which checks each value against the last record before it reaches the host.

## Develop

```bash
claude plugin validate .
claude plugin test .
pnpm install && pnpm check:ci
shellcheck -x backend/bin/* backend/lib/*.sh backend/lib/probe/*.sh backend/lib/action_scripts/*.sh
```

`scripts/sync-backend.sh <herdwatch checkout>` diffs `backend/` against upstream herdwatch. `scripts/build-icons.sh <herdwatch checkout>` copies the marks and renders the terminal PNGs (macOS, needs `swift`).

## License

MIT. Agent and program marks: LobeHub (MIT), Simple Icons (CC0) and Lucide (ISC); see `assets/`.
