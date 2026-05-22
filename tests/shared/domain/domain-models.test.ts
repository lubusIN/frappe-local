import { describe, expect, it } from 'vitest';
import {
  BenchSchema,
  CreateBenchInputSchema,
  mapBenchDomainToRecord,
  mapBenchRecordToDomain,
  normalizeId,
  normalizeTimestamp,
} from '../../../src/shared/domain/models';

describe('domain schemas', () => {
  it('accepts a valid bench domain object', () => {
    const parsedBench = BenchSchema.parse({
      id: 'bench-1',
      name: 'Frappe Bench',
      path: '/Users/example/frappe-bench',
      frappeVersion: 'version-15',
      status: 'running',
      apps: ['erpnext'],
      timestamps: {
        createdAt: '2026-04-18T10:00:00.000Z',
        updatedAt: '2026-04-18T10:05:00.000Z',
      },
    });

    expect(parsedBench.name).toBe('Frappe Bench');
  });

  it('rejects an invalid bench create payload', () => {
    const result = CreateBenchInputSchema.safeParse({
      name: ' ',
      path: '/tmp/bench',
      frappeVersion: 'version-15',
      status: 'running',
      apps: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('domain mappers', () => {
  it('maps a bench persistence record to a validated bench entity', () => {
    const bench = mapBenchRecordToDomain({
      id: '  bench-1  ',
      name: 'My Bench',
      path: '/tmp/bench',
      frappe_version: 'version-15',
      http_port: 8082,
      status: 'stopped',
      apps: ['frappe'],
      created_at: '2026-04-18T10:00:00.000Z',
      updated_at: '2026-04-18T11:00:00.000Z',
    });

    expect(bench.id).toBe('bench-1');
    expect(bench.frappeVersion).toBe('version-15');
    expect(bench.httpPort).toBe(8082);
    expect(bench.timestamps.updatedAt).toBe('2026-04-18T11:00:00.000Z');
  });

  it('maps a bench entity to persistence record shape', () => {
    const record = mapBenchDomainToRecord({
      id: ' bench-2 ',
      name: 'Second Bench',
      path: '/tmp/bench-2',
      frappeVersion: 'version-14',
      httpPort: 8090,
      status: 'queued',
      apps: ['frappe', 'payments'],
      timestamps: {
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:30:00.000Z',
      },
    });

    expect(record.id).toBe('bench-2');
    expect(record.frappe_version).toBe('version-14');
    expect(record.http_port).toBe(8090);
    expect(record.updated_at).toBe('2026-04-18T09:30:00.000Z');
  });

  it('normalizes ids and timestamps consistently', () => {
    expect(normalizeId('  abc  ')).toBe('abc');
    expect(normalizeTimestamp('2026-04-18T09:00:00.000Z')).toBe('2026-04-18T09:00:00.000Z');
  });
});
