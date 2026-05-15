import type { CatalogAppItem } from '../shared/ipc';

/**
 * Normalizes Frappe version identifiers used in the bench creation form
 * (e.g. "version-15", "version-16", "develop") into semver-style strings
 * that can be compared against catalog compatibility ranges.
 *
 * "develop" maps to a very high version so all apps are considered compatible.
 */
const normalizeFrappeVersion = (value: string): string => {
  const trimmed = value.trim().toLowerCase();

  // Branch-style identifiers from the version picker
  const branchMatch = trimmed.match(/^version[- ](\d+)$/);
  if (branchMatch) {
    return `${branchMatch[1]}.0.0`;
  }

  // "develop" is always the bleeding edge — treat as maximally compatible
  if (trimmed === 'develop') {
    return '999.0.0';
  }

  // Already a semver-ish string
  return trimmed;
};

const normalizeSupportedVersion = (value: string): string => normalizeFrappeVersion(value);

const parseVersion = (value: string): [number, number, number] => {
  const normalized = normalizeFrappeVersion(value);
  const [major = '0', minor = '0', patch = '0'] = normalized.split('.');
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
};

const compareVersion = (a: string, b: string): number => {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
};

export type CatalogCompatibilityContext = {
  readonly frappeVersion?: string;
};

export type CatalogCompatibilityResult = {
  readonly isCompatible: boolean;
  readonly status: 'ok' | 'warning' | 'blocked';
  readonly message: string;
};

export const evaluateCatalogCompatibility = (
  item: CatalogAppItem,
  context: CatalogCompatibilityContext
): CatalogCompatibilityResult => {
  if (context.frappeVersion && item.compatibility.supportedBenchVersions?.length) {
    const normalizedContextVersion = normalizeSupportedVersion(context.frappeVersion);
    const allowedVersions = new Set(item.compatibility.supportedBenchVersions.map(normalizeSupportedVersion));

    if (!allowedVersions.has(normalizedContextVersion)) {
      return {
        isCompatible: false,
        status: 'blocked',
        message: `Supported on ${item.compatibility.supportedBenchVersions.join(', ')} only.`,
      };
    }
  }

  if (context.frappeVersion && item.compatibility.minimumFrappeVersion) {
    if (compareVersion(context.frappeVersion, item.compatibility.minimumFrappeVersion) < 0) {
      return {
        isCompatible: false,
        status: 'blocked',
        message: `Requires Frappe ${item.compatibility.minimumFrappeVersion}+`,
      };
    }
  }

  if (context.frappeVersion && item.compatibility.maximumFrappeVersion) {
    if (compareVersion(context.frappeVersion, item.compatibility.maximumFrappeVersion) > 0) {
      return {
        isCompatible: false,
        status: 'blocked',
        message: `Only supported up to Frappe ${item.compatibility.maximumFrappeVersion.replace(/\.999\.999$/, '.x')}.`,
      };
    }
  }

  return {
    isCompatible: true,
    status: 'ok',
    message: 'Compatible',
  };
};
