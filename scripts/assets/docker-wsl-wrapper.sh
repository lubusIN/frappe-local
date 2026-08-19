#!/bin/sh

# Podman's Docker API intermittently fails the HTTP stream upgrade used by
# `docker exec`. Run only exec through native Podman in the machine's systemd
# namespace; keep all non-streaming Docker/Compose operations on the API.
if [ "$1" = "buildx" ] && [ "${2:-}" = "version" ]; then
  exit 1
fi

if [ "$1" = "exec" ]; then
  systemd_pid="$(/usr/bin/pgrep -o -x systemd)"
  if [ -z "$systemd_pid" ] || [ ! -d "/proc/$systemd_pid" ]; then
    echo "Frappe Local: Podman systemd namespace is unavailable." >&2
    exit 1
  fi
  exec /usr/bin/sudo /usr/bin/nsenter -m -p -t "$systemd_pid" --wd=/tmp \
    /usr/sbin/runuser -u user -- /usr/bin/env -u DOCKER_HOST -u CONTAINER_HOST \
    XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/podman --remote=false "$@"
fi

export DOCKER_HOST=unix:///mnt/wsl/frappe-local-devcontainer.sock
exec /usr/libexec/frappe-local/docker "$@"
