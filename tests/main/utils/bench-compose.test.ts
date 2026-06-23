import { describe, expect, it } from 'vitest';
import { generateBenchCompose } from '../../../src/main/utils/podman/bench-compose';

describe('bench compose generation', () => {
  it('generates the 3-container architecture using frappe/bench', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
      shareSshKeys: false,
    });

    expect(content).toContain('services:\n  frappe:\n    image: docker.io/frappe/bench:latest');
    expect(content).toContain('mariadb:\n    image: docker.io/mariadb:10.6');
    expect(content).toContain('redis:\n    image: docker.io/redis:alpine');
  });

  it('bind mounts the workspace root instead of using named volumes for app state', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
      shareSshKeys: false,
    });

    expect(content).toContain('- ../:/workspace:cached');
    expect(content).not.toContain('bench_assets');
    expect(content).not.toContain('bench_env');
  });

  it('maps HTTP and SocketIO ports correctly', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
      shareSshKeys: false,
    });

    // http port
    expect(content).toContain('"127.0.0.1:8080:8000"');
    // socketio port (http + 1000)
    expect(content).toContain('"127.0.0.1:9080:9000"');
  });

  it('keeps MariaDB password healthcheck as a literal for container-time expansion', () => {
    const content = generateBenchCompose({
      frappeVersion: 'v15.0.0',
      httpPort: 8080,
      shareSshKeys: false,
    });

    expect(content).toContain('mysqladmin ping -h localhost -u root -p$${MYSQL_ROOT_PASSWORD} || exit 1');
  });
});
