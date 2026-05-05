import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppCatalogItem, Bench, Settings, Site } from '../shared/domain/models';
import {
  createSha256,
  EXPORT_PACKAGE_VERSION,
  ExportPackageManifestSchema,
  ExportPackagePayloadSchema,
  type ExportPackageManifest,
  type ExportPackagePayload,
} from '../shared/domain/export-package';

export type ExportPackageWriterDependencies = {
  readonly benches: {
    findById: (id: string) => Promise<Bench | null>;
  };
  readonly sites: {
    findById: (id: string) => Promise<Site | null>;
  };
  readonly settings: {
    get: () => Promise<Settings | null>;
  };
  readonly appCatalog: {
    findAll: () => Promise<AppCatalogItem[]>;
  };
  readonly storageMetadata: {
    schemaVersion: number;
    appCatalogSeedVersion: number;
  };
  readonly appName?: string;
};

export type ExportSitePackageInput = {
  readonly siteId: string;
  readonly outputDirectory: string;
};

export type ExportSitePackageResult = {
  readonly artifactDirectory: string;
  readonly manifestPath: string;
  readonly payloadPath: string;
  readonly manifest: ExportPackageManifest;
};

const toSafeSlug = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
};

const buildRequiredApps = (catalog: readonly AppCatalogItem[], bench: Bench, site: Site): AppCatalogItem[] => {
  const requiredIds = new Set([...bench.apps, ...site.apps]);
  return catalog.filter((item) => requiredIds.has(item.id));
};

export const exportSitePackage = async (
  dependencies: ExportPackageWriterDependencies,
  input: ExportSitePackageInput
): Promise<ExportSitePackageResult> => {
  const site = await dependencies.sites.findById(input.siteId);
  if (!site) {
    throw new Error('Cannot export site: site was not found.');
  }

  const bench = await dependencies.benches.findById(site.benchId);
  if (!bench) {
    throw new Error('Cannot export site: parent bench was not found.');
  }

  const [settings, appCatalog] = await Promise.all([
    dependencies.settings.get(),
    dependencies.appCatalog.findAll(),
  ]);

  const requiredApps = buildRequiredApps(appCatalog, bench, site);
  const exportedAt = new Date().toISOString();

  const payload: ExportPackagePayload = ExportPackagePayloadSchema.parse({
    manifestVersion: EXPORT_PACKAGE_VERSION,
    exportedAt,
    data: {
      site,
      bench,
      settings,
      requiredApps,
    },
  });

  const payloadContents = `${JSON.stringify(payload, null, 2)}\n`;
  const payloadFileName = 'payload.json';
  const siteSlug = toSafeSlug(site.name);
  const artifactDirectory = path.join(input.outputDirectory, `${siteSlug}-export-v${EXPORT_PACKAGE_VERSION}`);
  const payloadPath = path.join(artifactDirectory, payloadFileName);
  const manifestPath = path.join(artifactDirectory, 'manifest.json');

  const manifest: ExportPackageManifest = ExportPackageManifestSchema.parse({
    packageVersion: EXPORT_PACKAGE_VERSION,
    exportedAt,
    site,
    bench,
    settings,
    requiredApps,
    payload: {
      fileName: payloadFileName,
      sha256: createSha256(payloadContents),
      sizeBytes: Buffer.byteLength(payloadContents, 'utf8'),
    },
    metadata: {
      storageSchemaVersion: dependencies.storageMetadata.schemaVersion,
      appCatalogSeedVersion: dependencies.storageMetadata.appCatalogSeedVersion,
      exportedBy: dependencies.appName ?? 'Frappe Cafe',
    },
  });

  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(payloadPath, payloadContents, 'utf8');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    artifactDirectory,
    manifestPath,
    payloadPath,
    manifest,
  };
};