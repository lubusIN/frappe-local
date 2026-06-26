import { describe, expect, it } from 'vitest';
import { parsePodmanJson } from '../../../src/main/utils/podman/podman';

describe('podman utilities', () => {
  it('parses warning-prefixed array JSON output', () => {
    const parsed = parsePodmanJson('Warning: stale connection\n[{"Name":"frappe-local","State":"running"}]');

    expect(parsed).toEqual([{ Name: 'frappe-local', State: 'running' }]);
  });

  it('parses warning-prefixed object JSON output', () => {
    const parsed = parsePodmanJson('Warning: stale connection\n{"Name":"frappe-local","State":"running"}');

    expect(parsed).toEqual({ Name: 'frappe-local', State: 'running' });
  });

  it('returns an empty array for malformed or empty output', () => {
    expect(parsePodmanJson('Warning: no json here')).toEqual([]);
    expect(parsePodmanJson('{"Name":')).toEqual([]);
  });
});
