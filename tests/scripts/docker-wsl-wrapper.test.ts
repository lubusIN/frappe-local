import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Docker WSL wrapper', () => {
  it('routes exec through native Podman and other commands through Docker API compatibility', () => {
    const wrapper = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/assets/docker-wsl-wrapper.sh'),
      'utf8'
    );

    expect(wrapper).toContain('if [ "$1" = "buildx" ] && [ "${2:-}" = "version" ]; then');
    expect(wrapper).toContain('if [ "$1" = "exec" ]; then');
    expect(wrapper).toContain('systemd_pid="$(/usr/bin/pgrep -o -x systemd)"');
    expect(wrapper).toContain('/usr/bin/sudo /usr/bin/nsenter -m -p');
    expect(wrapper).toContain('/usr/sbin/runuser -u user');
    expect(wrapper).toContain('/usr/bin/podman --remote=false "$@"');
    expect(wrapper).toContain('export DOCKER_HOST=unix:///mnt/wsl/frappe-local-devcontainer.sock');
    expect(wrapper).toContain('exec /usr/libexec/frappe-local/docker "$@"');
  });

  it('skips namespace entry for non-TTY environment probes', () => {
    const profile = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/assets/enterns-profile.sh'),
      'utf8'
    );

    expect(profile).toContain('if [ ! -t 0 ]; then');
    expect(profile).toContain('return 0');
    expect(profile).toContain('/usr/local/bin/enterns');
  });
});
