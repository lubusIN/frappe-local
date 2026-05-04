import { describe, expect, it } from 'vitest';
import {
  buildImportConflictPreview,
  getImportWizardStepErrors,
} from '../src/renderer/import-wizard';

describe('import wizard helpers', () => {
  it('requires an artifact directory in step 1', () => {
    expect(
      getImportWizardStepErrors(1, { artifactDirectory: '', benchId: '', conflictPolicy: 'block' }, null)
    ).toEqual(['Provide an export artifact directory before validation.']);
  });

  it('blocks step 2 progression when validation has hard errors', () => {
    expect(
      getImportWizardStepErrors(
        2,
        { artifactDirectory: '/tmp/export', benchId: '', conflictPolicy: 'block' },
        {
          canImport: false,
          summary: {
            packageVersion: 1,
            exportedAt: '2026-04-19T00:00:00.000Z',
            siteName: 'alpha.localhost',
            benchName: 'Alpha Bench',
            benchRuntime: 'podman',
            benchFrappeVersion: '15.0.0',
            requiredAppIds: ['frappe'],
          },
          issues: [{ severity: 'error', code: 'runtime-incompatible', message: 'bad runtime' }],
        }
      )
    ).toEqual(['Resolve import-blocking issues before continuing.']);
  });

  it('warns when the selected bench already has a site with the imported name', () => {
    const result = buildImportConflictPreview(
      [
        {
          id: 'bench-1',
          name: 'Alpha Bench',
          path: '/Users/example/alpha',
          frappeVersion: '15.0.0',
          runtime: 'podman',
          status: 'running',
          appCount: 2,
          createdAt: '',
          updatedAt: '',
        },
      ],
      [
        {
          id: 'site-1',
          name: 'alpha.localhost',
          benchId: 'bench-1',
          groupId: null,
          status: 'running',
          path: '/Users/example/alpha/sites/alpha.localhost',
          appCount: 2,
          createdAt: '',
          updatedAt: '',
        },
      ],
      'bench-1',
      {
        canImport: true,
        summary: {
          packageVersion: 1,
          exportedAt: '2026-04-19T00:00:00.000Z',
          siteName: 'alpha.localhost',
          benchName: 'Source Bench',
          benchRuntime: 'podman',
          benchFrappeVersion: '15.0.0',
          requiredAppIds: ['frappe'],
        },
        issues: [],
      }
    );

    expect(result.status).toBe('warning');
    expect(result.message).toContain('already exists');
  });

  it('requires conflict policy and bench selection in step 3', () => {
    expect(
      getImportWizardStepErrors(
        3,
        {
          artifactDirectory: '/tmp/export',
          benchId: '',
          conflictPolicy: 'block',
        },
        {
          canImport: true,
          summary: {
            packageVersion: 1,
            exportedAt: '2026-04-19T00:00:00.000Z',
            siteName: 'alpha.localhost',
            benchName: 'Alpha Bench',
            benchRuntime: 'podman',
            benchFrappeVersion: '15.0.0',
            requiredAppIds: ['frappe'],
          },
          issues: [],
        }
      )
    ).toEqual(['Select a target bench before confirming the import.']);
  });
});