import { describe, expect, it } from 'vitest';
import { generateBenchCompose } from '../../../src/main/utils/podman/bench-compose';

describe('bench compose generation', () => {
  it('keeps MariaDB healthcheck variable as a literal for container-time expansion', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
    });

    expect(content).toContain('MARIADB_ROOT_PASSWORD=123');
    expect(content).toContain('mysqladmin ping -h localhost -p$${MARIADB_ROOT_PASSWORD} || exit 1');
  });

  it('copies bundled apps into the host apps volume via configurator', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
    });

    expect(content).toContain('cp -rn /home/frappe/frappe-bench/apps/. /var/local-bench/apps/;');
    expect(content).toContain('- ../apps:/var/local-bench/apps');
    expect(content).toContain('- ../apps:/home/frappe/frappe-bench/apps');
  });

  it('wires persistent sites/apps volumes so built assets are available to backend and frontend', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
    });

    expect(content).toContain('if [ -L /home/frappe/frappe-bench/sites/assets ]; then rm /home/frappe/frappe-bench/sites/assets; fi;');
    expect(content).toContain('mkdir -p /home/frappe/frappe-bench/sites/assets;');
    expect(content).toContain('cp -rn /home/frappe/frappe-bench/assets/. /var/local-bench/assets/;');
    expect(content).toContain('cp -rn /var/local-bench/assets/. /home/frappe/frappe-bench/sites/assets/;');
    expect(content).toContain('- ../sites:/home/frappe/frappe-bench/sites');
    expect(content).toContain('- ../apps:/home/frappe/frappe-bench/apps:ro');
    expect(content).toContain('- bench_assets:/home/frappe/frappe-bench/assets');
    expect(content).toContain('- ./assets:/var/local-bench/assets');
  });

  it('seeds env volume from image via configurator and mounts it persistently in backend and websocket', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
    });

    expect(content).toContain('cp -rn /home/frappe/frappe-bench/env/. /var/local-bench/env/;');
    expect(content).toContain('- bench_env:/var/local-bench/env');
    expect(content).toContain('- bench_env:/home/frappe/frappe-bench/env');
    expect(content).toContain('volumes:\n  bench_assets:\n  bench_env:');
    expect(content).not.toContain('../env');
  });

  it('sets empty entrypoint arrays for backend, frontend, and websocket to bypass problematic entrypoint scripts', () => {
    const content = generateBenchCompose({
      frappeVersion: 'version-16',
      httpPort: 8080,
    });

    expect(content).toContain('backend:\n    image: docker.io/frappe/erpnext:version-16\n    entrypoint: []');
    expect(content).toContain('frontend:\n    image: docker.io/frappe/erpnext:version-16\n    entrypoint: []');
    expect(content).toContain('websocket:\n    image: docker.io/frappe/erpnext:version-16\n    entrypoint: []');
  });
});
