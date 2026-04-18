import type { CatalogAppItem } from '../shared/ipc';

const parseVersion = (value: string): [number, number, number] => {
  const [major = '0', minor = '0', patch = '0'] = value.trim().split('.');
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
  readonly runtime?: 'docker' | 'podman';
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
  if (context.runtime && !item.compatibility.supportedRuntimes.includes(context.runtime)) {
    return {
      isCompatible: false,
      status: 'blocked',
      message: `Not supported on ${context.runtime}.`,
    };
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
        isCompatible: true,
        status: 'warning',
        message: `Validated up to Frappe ${item.compatibility.maximumFrappeVersion}.`,
      };
    }
  }

  return {
    isCompatible: true,
    status: 'ok',
    message: 'Compatible',
  };
};
