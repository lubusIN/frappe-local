import { describe, expect, it } from 'vitest';
import {
  buildBenchCreatePayload,
  getBenchWizardStepErrors,
  isValidBenchName,
} from '../../../src/renderer/controllers/bench-wizard';

describe('bench wizard helpers', () => {
  it('validates supported bench name format', () => {
    expect(isValidBenchName('frappe-bench')).toBe(true);
    expect(isValidBenchName(' Bench Local ')).toBe(false);
  });

  it('returns step errors for invalid or missing details', () => {
    const draft = {
      name: 'Bench Local',
      path: '',
      frappeVersion: '',
      appsSelected: [],
    };

    expect(getBenchWizardStepErrors(1, draft)).toEqual([
      'Bench name can include lowercase letters, numbers, dots, and hyphens only.',
      'Select a Frappe version.',
      'Enter a bench path.',
    ]);
  });

  it('builds create payload when draft is valid', () => {
    const draft = {
      name: '  frappe-bench  ',
      path: '  /Users/dev/frappe-bench  ',
      frappeVersion: '  version-16  ',
      appsSelected: [' payments ', '  '],
    };

    const result = buildBenchCreatePayload(draft);

    expect(result.errors).toEqual([]);
    expect(result.payload).toEqual({
      name: 'frappe-bench',
      path: '/Users/dev/frappe-bench',
      frappeVersion: 'version-16',
      apps: ['frappe', 'payments'],
    });
  });

  it('defaults apps to preinstalled core apps when none are selected', () => {
    const result = buildBenchCreatePayload({
      name: 'frappe-bench',
      path: '/Users/dev/frappe-bench',
      frappeVersion: 'version-16',
      appsSelected: [],
    });

    expect(result.payload?.apps).toEqual(['frappe']);
  });

  it('deduplicates selected apps against core defaults', () => {
    const result = buildBenchCreatePayload({
      name: 'frappe-bench',
      path: '/Users/dev/frappe-bench',
      frappeVersion: 'version-16',
      appsSelected: ['frappe', 'payments', 'payments'],
    });

    expect(result.payload?.apps).toEqual(['frappe', 'payments']);
  });
});
