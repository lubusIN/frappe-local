import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppCatalogItem } from '../shared/domain/models';
import {
  createSha256,
  EXPORT_PACKAGE_VERSION,
  ExportPackageManifestSchema,
  ExportPackagePayloadSchema,
  type ExportPackageManifest,
  type ExportPackagePayload,
} from '../shared/domain/export-package';

const parseVersion = (value: string): [number, number, number] => {
  const [major = '0', minor = '0', patch = '0'] = value.trim().split('.');
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
};

const compareVersion = (a: string, b: string): number => {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) {
    return aMajor - bMajor;
  }

  if (aMinor !== bMinor) {
    return aMinor - bMinor;
  }

  return aPatch - bPatch;
};

export type ParsedImportPackage = {
  readonly artifactDirectory: string;
  readonly manifestPath: string;
  readonly payloadPath: string;
  readonly manifest: ExportPackageManifest;
  readonly payload: ExportPackagePayload;
};

export type ImportValidationIssue = {
  readonly severity: 'error' | 'warning';
  readonly code:
    | 'unsupported-package-version'
    | 'runtime-incompatible'
    | 'frappe-version-too-low'
    | 'frappe-version-warning'
    | 'missing-required-app';
  readonly message: string;
};

export type ImportValidationResult = {
  readonly canImport: boolean;
  readonly issues: ImportValidationIssue[];
};

export type ImportCompatibilityContext = {
  readonly supportedPackageVersions?: readonly number[];
  readonly targetRuntime?: 'docker' | 'podman';
  readonly targetFrappeVersion?: string;
  readonly availableAppIds?: readonly string[];
};

export const parseImportPackage = async (artifactDirectory: string): Promise<ParsedImportPackage> => {
  const manifestPath = path.join(artifactDirectory, 'manifest.json');
  const manifestContents = await readFile(manifestPath, 'utf8');
  const manifest = ExportPackageManifestSchema.parse(JSON.parse(manifestContents));

  const payloadPath = path.join(artifactDirectory, manifest.payload.fileName);
  const payloadContents = await readFile(payloadPath, 'utf8');
  const payloadChecksum = createSha256(payloadContents);

  if (payloadChecksum !== manifest.payload.sha256) {
    throw new Error('Import package checksum verification failed for payload.json.');
  }

  if (Buffer.byteLength(payloadContents, 'utf8') !== manifest.payload.sizeBytes) {
    throw new Error('Import package payload size does not match the manifest.');
  }

  const payload = ExportPackagePayloadSchema.parse(JSON.parse(payloadContents));

  if (payload.manifestVersion !== manifest.packageVersion) {
    throw new Error('Import package manifest and payload versions do not match.');
  }

  return {
    artifactDirectory,
    manifestPath,
    payloadPath,
    manifest,
    payload,
  };
};

export const validateImportCompatibility = (
  parsedPackage: ParsedImportPackage,
  context: ImportCompatibilityContext
): ImportValidationResult => {
  const issues: ImportValidationIssue[] = [];
  const supportedPackageVersions = context.supportedPackageVersions ?? [EXPORT_PACKAGE_VERSION];
  const availableAppIds = new Set(context.availableAppIds ?? []);

  if (!supportedPackageVersions.includes(parsedPackage.manifest.packageVersion)) {
    issues.push({
      severity: 'error',
      code: 'unsupported-package-version',
      message: `Package version ${parsedPackage.manifest.packageVersion} is not supported by this app.`,
    });
  }

  if (
    context.targetRuntime &&
    parsedPackage.manifest.bench.runtime !== context.targetRuntime
  ) {
    issues.push({
      severity: 'error',
      code: 'runtime-incompatible',
      message: `Exported site expects ${parsedPackage.manifest.bench.runtime}, but the selected target uses ${context.targetRuntime}.`,
    });
  }

  const targetFrappeVersion = context.targetFrappeVersion;
  if (targetFrappeVersion) {
    if (compareVersion(targetFrappeVersion, parsedPackage.manifest.bench.frappeVersion) < 0) {
      issues.push({
        severity: 'error',
        code: 'frappe-version-too-low',
        message: `Target Frappe ${targetFrappeVersion} is lower than exported site requirement ${parsedPackage.manifest.bench.frappeVersion}.`,
      });
    }

    parsedPackage.manifest.requiredApps.forEach((app) => {
      if (
        app.compatibility.maximumFrappeVersion &&
        compareVersion(targetFrappeVersion, app.compatibility.maximumFrappeVersion) > 0
      ) {
        issues.push({
          severity: 'warning',
          code: 'frappe-version-warning',
          message: `${app.name} is validated up to Frappe ${app.compatibility.maximumFrappeVersion}.`,
        });
      }
    });
  }

  parsedPackage.manifest.requiredApps.forEach((app: AppCatalogItem) => {
    if (availableAppIds.size > 0 && !availableAppIds.has(app.id)) {
      issues.push({
        severity: 'warning',
        code: 'missing-required-app',
        message: `${app.name} is not currently available in the local catalog and may require manual installation.`,
      });
    }
  });

  return {
    canImport: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
};