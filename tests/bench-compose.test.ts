import { describe, expect, it } from 'vitest';
import { generateBenchCompose } from '../src/main/utils/bench-compose';

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
});
