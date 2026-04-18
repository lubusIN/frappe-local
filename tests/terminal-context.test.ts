import { describe, expect, it } from 'vitest';
import {
  validateBenchId,
  validateSiteId,
  validateWorkspacePath,
  validateTerminalContext,
  buildWorkingDirectory,
  isScopeValid,
} from '../src/shared/domain/terminal-context';

describe('terminal context validation - bench ID', () => {
  it('accepts valid bench IDs with alphanumeric, hyphens, and underscores', () => {
    expect(validateBenchId('my-bench')).toBe(true);
    expect(validateBenchId('bench_1')).toBe(true);
    expect(validateBenchId('bench-123-prod')).toBe(true);
    expect(validateBenchId('a')).toBe(true);
  });

  it('rejects empty or invalid bench IDs', () => {
    expect(validateBenchId('')).toBe(false);
    expect(validateBenchId('..')).toBe(false);
    expect(validateBenchId('bench/')).toBe(false);
    expect(validateBenchId('bench with spaces')).toBe(false);
    expect(validateBenchId('../../../etc/passwd')).toBe(false);
  });

  it('rejects bench IDs that exceed length limit', () => {
    const longId = 'a'.repeat(256);
    expect(validateBenchId(longId)).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(validateBenchId(null as unknown as string)).toBe(false);
    expect(validateBenchId(undefined as unknown as string)).toBe(false);
    expect(validateBenchId(123 as unknown as string)).toBe(false);
  });
});

describe('terminal context validation - site ID', () => {
  it('accepts null as valid site ID', () => {
    expect(validateSiteId(null)).toBe(true);
  });

  it('accepts valid site IDs with alphanumeric, hyphens, and underscores', () => {
    expect(validateSiteId('my-site')).toBe(true);
    expect(validateSiteId('site_1')).toBe(true);
    expect(validateSiteId('site-prod-01')).toBe(true);
  });

  it('rejects empty site IDs', () => {
    expect(validateSiteId('')).toBe(false);
  });

  it('rejects site IDs with path traversal attempts', () => {
    expect(validateSiteId('..')).toBe(false);
    expect(validateSiteId('../site')).toBe(false);
    expect(validateSiteId('site/')).toBe(false);
    expect(validateSiteId('../../../etc/passwd')).toBe(false);
  });

  it('rejects non-string inputs (except null)', () => {
    expect(validateSiteId(undefined as unknown as string)).toBe(false);
    expect(validateSiteId(123 as unknown as string)).toBe(false);
  });
});

describe('terminal context validation - workspace path', () => {
  it('accepts valid relative and absolute paths', () => {
    expect(validateWorkspacePath('workspace')).toBe(true);
    expect(validateWorkspacePath('my-workspace-1')).toBe(true);
    expect(validateWorkspacePath('/Users/example/frappe-bench')).toBe(true);
  });

  it('accepts ordinary path strings that include dots or backslashes', () => {
    expect(validateWorkspacePath('workspace..')).toBe(true);
    expect(validateWorkspacePath('workspace\\')).toBe(true);
  });

  it('rejects empty or excessive paths', () => {
    expect(validateWorkspacePath('')).toBe(false);
    expect(validateWorkspacePath('a'.repeat(5000))).toBe(false);
    expect(validateWorkspacePath(`safe-path\0bad`)).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(validateWorkspacePath(null as unknown as string)).toBe(false);
    expect(validateWorkspacePath(undefined as unknown as string)).toBe(false);
  });
});

describe('terminal context validation - full context', () => {
  it('accepts valid context with bench and site', () => {
    const result = validateTerminalContext('my-bench', 'my-site', 'workspace');
    expect(result.valid).toBe(true);
    expect(result.context).toEqual({
      benchId: 'my-bench',
      siteId: 'my-site',
      workspacePath: 'workspace',
    });
    expect(result.errors).toHaveLength(0);
  });

  it('accepts valid context with null site', () => {
    const result = validateTerminalContext('my-bench', null, 'workspace');
    expect(result.valid).toBe(true);
    expect(result.context).toEqual({
      benchId: 'my-bench',
      siteId: null,
      workspacePath: 'workspace',
    });
  });

  it('rejects context with invalid bench ID', () => {
    const result = validateTerminalContext('../../../etc/passwd', 'site', 'workspace');
    expect(result.valid).toBe(false);
    expect(result.context).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects context with invalid site ID', () => {
    const result = validateTerminalContext('bench', '../../etc/passwd', 'workspace');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects context with invalid path', () => {
    const result = validateTerminalContext('bench', 'site', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects context with multiple errors', () => {
    const result = validateTerminalContext('../bad', '..', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('terminal context operations', () => {
  it('builds working directory from context', () => {
    const context = {
      benchId: 'my-bench',
      siteId: null,
      workspacePath: 'workspace',
    };

    const workingDir = buildWorkingDirectory(context);
    expect(workingDir).toBe('workspace');
  });

  it('validates scope correctly for valid context', () => {
    const context = {
      benchId: 'my-bench',
      siteId: 'my-site',
      workspacePath: 'workspace',
    };

    expect(isScopeValid(context)).toBe(true);
  });

  it('rejects invalid context scope', () => {
    const context = {
      benchId: '../../../etc/passwd',
      siteId: 'site',
      workspacePath: 'workspace',
    };

    expect(isScopeValid(context)).toBe(false);
  });
});

describe('terminal context edge cases', () => {
  it('handles very long but valid IDs at length limit', () => {
    const id = 'a'.repeat(255);
    expect(validateBenchId(id)).toBe(true);
  });

  it('handles mixed case alphanumeric IDs', () => {
    expect(validateBenchId('MyBench123')).toBe(true);
    expect(validateBenchId('BENCH-PROD')).toBe(true);
  });

  it('protects against unicode path traversal', () => {
    expect(validateWorkspacePath('/Users/example/workspace\u002e\u002e')).toBe(true);
  });

  it('validates context with special but valid characters in IDs', () => {
    const result = validateTerminalContext(
      'bench-123_abc',
      'site_prod-02',
      'workspace-prod'
    );
    expect(result.valid).toBe(true);
  });
});
