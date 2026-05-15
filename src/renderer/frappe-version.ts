const SUPPORTED_SELECTOR_VERSIONS = new Set(['version-15', 'version-16', 'develop']);

export const DEFAULT_SELECTOR_FRAPPE_VERSION = 'version-16';

export const toSelectorFrappeVersion = (value: string | null | undefined): string => {
  if (!value) {
    return DEFAULT_SELECTOR_FRAPPE_VERSION;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_SELECTOR_FRAPPE_VERSION;
  }

  if (SUPPORTED_SELECTOR_VERSIONS.has(normalized)) {
    return normalized;
  }

  if (normalized === 'version 15') return 'version-15';
  if (normalized === 'version 16') return 'version-16';
  if (normalized === 'v15' || normalized === 'v15.0.0' || normalized === '15' || normalized === '15.0.0') {
    return 'version-15';
  }
  if (normalized === 'v16' || normalized === 'v16.0.0' || normalized === '16' || normalized === '16.0.0') {
    return 'version-16';
  }
  if (normalized === 'develop') {
    return 'develop';
  }

  const majorMatch = normalized.match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (majorMatch) {
    if (majorMatch[1] === '15') return 'version-15';
    if (majorMatch[1] === '16') return 'version-16';
  }

  return DEFAULT_SELECTOR_FRAPPE_VERSION;
};