import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execPromiseMock = vi.fn();
const getPodmanMachinesMock = vi.fn();

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      totalmem: () => 16 * 1024 * 1024 * 1024,
    },
    totalmem: () => 16 * 1024 * 1024 * 1024,
  };
});

vi.mock('../../../src/main/utils/exec', () => ({
  execPromise: (...args: unknown[]) => execPromiseMock(...args),
}));

vi.mock('../../../src/main/utils/binaries', () => ({
  getBinaryPath: (name: string) => `/mock/${name}`,
}));

vi.mock('../../../src/main/utils/podman/podman', () => ({
  isPodmanMachineRequired: () => true,
  getPodmanMachines: () => getPodmanMachinesMock(),
  cleanupStaleMacPodmanProcesses: vi.fn(async () => undefined),
}));

import {
  applyPodmanMachineMemory,
  configurePodmanMemoryProvider,
  configureWslConfigPathProvider,
  ensureRuntimeRunning,
  ensureWindowsDevContainerSupport,
  getLastRuntimeError,
  FRAPPE_LOCAL_MACHINE_NAME,
  updateWslConfigMemory,
} from '../../../src/main/services/runtime-service';

describe('Podman machine memory configuration', () => {
  const wslConfigPath = path.join(os.tmpdir(), `frappe-local-test-${process.pid}.wslconfig`);

  beforeEach(() => {
    execPromiseMock.mockReset();
    getPodmanMachinesMock.mockReset();
    execPromiseMock.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    configurePodmanMemoryProvider(async () => 4096);
    configureWslConfigPathProvider(() => wslConfigPath);
    fs.rmSync(wslConfigPath, { force: true });
  });

  it('preserves unrelated WSL settings while setting the memory limit', () => {
    const existing = '[wsl2]\r\nprocessors=4\r\n\r\n[experimental]\r\nautoMemoryReclaim=gradual\r\n';

    expect(updateWslConfigMemory(existing, 6144)).toBe(
      '[wsl2]\r\nmemory=6144MB\r\nprocessors=4\r\n\r\n[experimental]\r\nautoMemoryReclaim=gradual\r\n'
    );
    expect(updateWslConfigMemory('[wsl2]\nmemory=4096MB\n', 6144)).toBe(
      '[wsl2]\nmemory=6144MB\n'
    );
  });

  it('uses configured memory when initializing the Frappe Local machine', async () => {
    configurePodmanMemoryProvider(async () => 8192);
    getPodmanMachinesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Name: FRAPPE_LOCAL_MACHINE_NAME, State: 'running' }]);

    await expect(ensureRuntimeRunning()).resolves.toBe(true);

    expect(execPromiseMock).toHaveBeenCalledWith(
      '/mock/podman',
      process.platform === 'win32'
        ? ['machine', 'init', '--now', FRAPPE_LOCAL_MACHINE_NAME]
        : ['machine', 'init', '--now', '--cpus', '4', '--memory', '8192', FRAPPE_LOCAL_MACHINE_NAME],
      undefined,
      expect.any(Function),
      expect.anything(),
      {
        idleTimeout: 300000,
        maxTimeout: 1800000,
      }
    );

    if (process.platform === 'win32') {
      expect(fs.readFileSync(wslConfigPath, 'utf8')).toContain('memory=8192MB');
      expect(execPromiseMock).toHaveBeenCalledWith(
        'wsl.exe',
        ['--shutdown'],
        undefined,
        undefined,
        undefined,
        { idleTimeout: 60000, maxTimeout: 120000 }
      );
    }
  });

  it('restarts a running machine around a changed memory allocation', async () => {
    getPodmanMachinesMock.mockResolvedValue([
      { Name: FRAPPE_LOCAL_MACHINE_NAME, State: 'running' },
    ]);
    execPromiseMock.mockImplementation(async (_binary: string, args: string[]) => {
      if (args[0] === 'machine' && args[1] === 'inspect') {
        return { stdout: '4096\n', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });

    await applyPodmanMachineMemory(6144);

    const commands = execPromiseMock.mock.calls.map(([, args]) => args);
    if (process.platform === 'win32') {
      expect(fs.readFileSync(wslConfigPath, 'utf8')).toContain('memory=6144MB');
      expect(execPromiseMock).toHaveBeenCalledWith(
        'wsl.exe',
        ['--shutdown'],
        undefined,
        undefined,
        undefined,
        { idleTimeout: 60000, maxTimeout: 120000 }
      );
      expect(commands).not.toContainEqual(expect.arrayContaining(['machine', 'set', '--memory']));
    } else {
      expect(commands).toContainEqual(['machine', 'stop', FRAPPE_LOCAL_MACHINE_NAME]);
      expect(commands).toContainEqual([
        'machine',
        'set',
        '--memory',
        '6144',
        FRAPPE_LOCAL_MACHINE_NAME,
      ]);
    }
    expect(commands).toContainEqual(['machine', 'start', FRAPPE_LOCAL_MACHINE_NAME]);
  });

  it('retains stderr from non-zero Podman commands', async () => {
    execPromiseMock.mockResolvedValueOnce({
      stdout: '',
      stderr: 'helper binary vfkit was not found',
      code: 125,
    });

    await expect(ensureRuntimeRunning()).resolves.toBe(false);
    expect(getLastRuntimeError()).toContain('helper binary vfkit was not found');
  });

  it('provisions Docker-compatible Dev Container support in the app-owned WSL distro', async () => {
    await ensureWindowsDevContainerSupport();

    if (process.platform === 'win32') {
      expect(execPromiseMock).toHaveBeenCalledWith(
        'wsl.exe',
        [
          '--distribution',
          `podman-${FRAPPE_LOCAL_MACHINE_NAME}`,
          '--user',
          'root',
          '--exec',
          '/bin/sh',
          '-c',
          'compose_source="$(wslpath -u "$1")" && docker_cli_source="$(wslpath -u "$2")" && docker_wrapper_source="$(wslpath -u "$3")" && enterns_profile_source="$(wslpath -u "$4")" && mkdir -p /usr/libexec/docker/cli-plugins /usr/libexec/frappe-local && if ! cmp -s "$compose_source" /usr/libexec/docker/cli-plugins/docker-compose; then install -m 0755 "$compose_source" /usr/libexec/docker/cli-plugins/docker-compose; fi && if ! cmp -s "$docker_cli_source" /usr/libexec/frappe-local/docker; then install -m 0755 "$docker_cli_source" /usr/libexec/frappe-local/docker; fi && if ! cmp -s "$enterns_profile_source" /etc/profile.d/enterns.sh; then install -m 0644 "$enterns_profile_source" /etc/profile.d/enterns.sh; fi && systemd_pid="$(/usr/bin/pgrep -o -x systemd)" && test -n "$systemd_pid" && test -e "/proc/$systemd_pid/ns/pid" && if ! /usr/sbin/runuser -u user -- /usr/bin/podman --remote --url unix:///mnt/wsl/frappe-local-devcontainer.sock info >/dev/null 2>&1; then { /usr/bin/nsenter -m -p -t "$systemd_pid" --wdns=/tmp /usr/sbin/runuser -u user -- /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemctl --user stop frappe-local-devcontainer-api.service >/dev/null 2>&1 || true; }; rm -f /mnt/wsl/frappe-local-devcontainer.sock; /usr/bin/nsenter -m -p -t "$systemd_pid" --wdns=/tmp /usr/sbin/runuser -u user -- /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemd-run --user --unit=frappe-local-devcontainer-api --collect --property=Restart=always /usr/bin/podman --remote=false system service --time=0 unix:///mnt/wsl/frappe-local-devcontainer.sock; i=0; while [ ! -S /mnt/wsl/frappe-local-devcontainer.sock ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done; test -S /mnt/wsl/frappe-local-devcontainer.sock; fi && rm -f /usr/bin/docker && install -m 0755 "$docker_wrapper_source" /usr/bin/docker && ln -sfn /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose',
          'frappe-local-devcontainer-setup',
          '/mock/docker-compose-linux.bin',
          '/mock/docker-cli-linux.bin',
          '/mock/docker-wsl-wrapper.sh',
          '/mock/enterns-profile.sh',
        ],
        undefined,
        undefined,
        undefined,
        { idleTimeout: 15000, maxTimeout: 30000 }
      );
    } else {
      expect(execPromiseMock).not.toHaveBeenCalled();
    }
  });

  it('provides actionable remediation when Dev Container support cannot be installed', async () => {
    if (process.platform !== 'win32') return;
    execPromiseMock.mockResolvedValueOnce({ stdout: '', stderr: 'permission denied', code: 1 });

    await expect(ensureWindowsDevContainerSupport()).rejects.toThrow(
      'Restart Frappe Local, then retry.'
    );
  });

  it('formats DOCKER_HOST properly for Windows named pipes and unix sockets', async () => {
    const { getRuntimeEnv } = await import('../../../src/main/services/runtime-service');
    
    // Test Named Pipe format
    execPromiseMock.mockResolvedValueOnce({
      stdout: '\\\\.\\pipe\\podman-frappe-local\n',
      stderr: '',
      code: 0,
    });

    const env1 = await getRuntimeEnv();
    if (process.platform === 'win32') {
      expect(env1.DOCKER_HOST).toBe('npipe:////./pipe/podman-frappe-local');
    }

    // Test Windows drive letter file path format
    execPromiseMock.mockResolvedValueOnce({
      stdout: 'C:\\Users\\test\\AppData\\Local\\Temp\\podman\\frappe-local-api.sock\n',
      stderr: '',
      code: 0,
    });

    const env2 = await getRuntimeEnv();
    if (process.platform === 'win32') {
      expect(env2.DOCKER_HOST).toBe('unix:///C:/Users/test/AppData/Local/Temp/podman/frappe-local-api.sock');
    }
  });
});
