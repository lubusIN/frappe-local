import { describe, expect, it } from 'vitest';
import {
  buildDependencyGuidance,
  compareDependencyVersions,
  minimumDependencyVersions,
  parseDependencyVersion,
  toDependencyHealth,
} from '../src/shared/domain/runtime-health';

describe('runtime health domain helpers', () => {
  it('parses versions from mixed command output', () => {
    expect(parseDependencyVersion('git version 2.39.3 (Apple Git-146)')).toEqual({
      major: 2,
      minor: 39,
      patch: 3,
      raw: '2.39.3',
    });
    expect(parseDependencyVersion('Docker Compose version v2.24.6')).toEqual({
      major: 2,
      minor: 24,
      patch: 6,
      raw: '2.24.6',
    });
  });

  it('returns null for malformed version output', () => {
    expect(parseDependencyVersion('unknown version string')).toBeNull();
    expect(parseDependencyVersion('')).toBeNull();
  });

  it('compares dependency versions deterministically', () => {
    const minimum = parseDependencyVersion(minimumDependencyVersions.git);
    expect(compareDependencyVersions(parseDependencyVersion('2.39.0'), minimum)).toBe(0);
    expect(compareDependencyVersions(parseDependencyVersion('2.40.0'), minimum)).toBe(1);
    expect(compareDependencyVersions(parseDependencyVersion('2.38.1'), minimum)).toBe(-1);
  });

  it('builds actionable guidance for each state', () => {
    expect(buildDependencyGuidance('git', 'ready').title).toContain('ready');
    expect(buildDependencyGuidance('podman', 'missing').steps[0]).toContain('Install Podman');
    expect(buildDependencyGuidance('docker-compose', 'incompatible').steps[0]).toContain('at least');
    expect(buildDependencyGuidance('git', 'unknown').steps[0]).toContain('Git');
  });

  it('maps a probe result into a UI-facing health summary', () => {
    const health = toDependencyHealth({
      dependency: 'docker-compose',
      installed: true,
      version: '2.10.0',
      minimumVersion: minimumDependencyVersions['docker-compose'],
      status: 'incompatible',
    });

    expect(health.summary).toContain('below the required version');
    expect(health.guidance.title).toContain('Upgrade Docker Compose');
    expect(health.requiredVersion).toBe(minimumDependencyVersions['docker-compose']);
  });
});