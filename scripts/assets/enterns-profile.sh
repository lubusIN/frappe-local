# FRAPPE_LOCAL_MANAGED_ENTERNS_PROFILE
# Environment probes use a non-TTY login shell and only need exported values.
# Interactive WSL terminals still enter Podman machine's systemd namespace.
if [ ! -t 0 ]; then
  return 0
fi

SYSDPID="$(ps -eo cmd,pid | grep -m 1 '^/lib/systemd/systemd' | awk '{print $2}')"
if [ -n "$SYSDPID" ] && [ "$SYSDPID" != "1" ]; then
  cat /etc/wslmotd
  /usr/local/bin/enterns
fi
