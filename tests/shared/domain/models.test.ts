import { describe, expect, it } from 'vitest';
import {
  mapBenchDomainToRecord,
  mapBenchRecordToDomain,
  mapCustomAppRecordToDomain,
  normalizeId,
  normalizeTimestamp,
} from '../../../src/shared/domain/models';

describe('domain models mapping & normalization', () => {
  it('normalizes ids and timestamps', () => {
    expect(normalizeId('  my-bench  ')).toBe('my-bench');
    expect(normalizeTimestamp('2026-06-26T12:00:00Z')).toBe('2026-06-26T12:00:00.000Z');
  });

  it('maps bench record to domain and back roundtrip', () => {
    const record = {
      id: ' bench-1 ',
      name: 'Bench 1',
      path: '/path/to/bench',
      frappe_version: 'version-15',
      http_port: 8000,
      status: 'running' as const,
      apps: ['frappe', 'erpnext'],
      created_at: '2026-06-26T10:00:00Z',
      updated_at: '2026-06-26T11:00:00Z',
    };

    const domain = mapBenchRecordToDomain(record);
    expect(domain.id).toBe('bench-1');
    expect(domain.frappeVersion).toBe('version-15');
    expect(domain.httpPort).toBe(8000);
    expect(domain.timestamps.createdAt).toBe('2026-06-26T10:00:00.000Z');

    const mappedBack = mapBenchDomainToRecord(domain);
    expect(mappedBack.id).toBe('bench-1');
    expect(mappedBack.frappe_version).toBe('version-15');
    expect(mappedBack.http_port).toBe(8000);
  });

  it('maps custom app record to domain item', () => {
    const record = {
      id: 'app-1',
      name: 'my_app',
      title: 'My App',
      description: 'Custom Frappe App',
      type: 'github' as const,
      source: 'https://github.com/example/my_app',
      branch: 'main',
      created_at: '2026-06-26T10:00:00Z',
      updated_at: '2026-06-26T11:00:00Z',
    };

    const domain = mapCustomAppRecordToDomain(record);
    expect(domain.name).toBe('my_app');
    expect(domain.title).toBe('My App');
    expect(domain.source).toBe('https://github.com/example/my_app');
  });
});
