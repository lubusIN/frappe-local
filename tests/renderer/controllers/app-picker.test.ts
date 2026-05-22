import { describe, expect, it } from 'vitest';
import { normalizeSelection, toggleAppSelection } from '../../../src/renderer/controllers/app-picker';

describe('app picker state', () => {
  it('toggles app ids in selection', () => {
    expect(toggleAppSelection([], 'frappe')).toEqual(['frappe']);
    expect(toggleAppSelection(['frappe'], 'frappe')).toEqual([]);
  });

  it('normalizes duplicate and empty ids', () => {
    expect(normalizeSelection([' frappe ', 'erpnext', 'frappe', ''])).toEqual(['frappe', 'erpnext']);
  });
});
