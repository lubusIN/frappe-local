import { describe, expect, it } from 'vitest';
import { DEFAULT_SELECTOR_FRAPPE_VERSION, toSelectorFrappeVersion } from '../src/renderer/frappe-version';

describe('renderer frappe version normalization', () => {
  it('returns selector values as-is', () => {
    expect(toSelectorFrappeVersion('version-15')).toBe('version-15');
    expect(toSelectorFrappeVersion('version-16')).toBe('version-16');
    expect(toSelectorFrappeVersion('develop')).toBe('develop');
  });

  it('normalizes semver and v-prefixed values from settings', () => {
    expect(toSelectorFrappeVersion('15.0.0')).toBe('version-15');
    expect(toSelectorFrappeVersion('16.0.0')).toBe('version-16');
    expect(toSelectorFrappeVersion('v15')).toBe('version-15');
    expect(toSelectorFrappeVersion('v16.0.0')).toBe('version-16');
  });

  it('normalizes spaced version labels', () => {
    expect(toSelectorFrappeVersion('version 15')).toBe('version-15');
    expect(toSelectorFrappeVersion('version 16')).toBe('version-16');
  });

  it('falls back to default selector version for unknown inputs', () => {
    expect(toSelectorFrappeVersion('nightly')).toBe(DEFAULT_SELECTOR_FRAPPE_VERSION);
    expect(toSelectorFrappeVersion('')).toBe(DEFAULT_SELECTOR_FRAPPE_VERSION);
    expect(toSelectorFrappeVersion(undefined)).toBe(DEFAULT_SELECTOR_FRAPPE_VERSION);
    expect(toSelectorFrappeVersion(null)).toBe(DEFAULT_SELECTOR_FRAPPE_VERSION);
  });
});