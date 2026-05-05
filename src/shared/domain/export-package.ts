import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  AppSchema,
  BenchSchema,
  SettingsSchema,
  SiteSchema,
} from './models';

export const EXPORT_PACKAGE_VERSION = 1;

const isoDateString = z.string().datetime();
const nonEmptyString = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i);

export const ExportPackageReferenceSchema = z.object({
  fileName: nonEmptyString,
  sha256: sha256Hex,
  sizeBytes: z.number().int().nonnegative(),
});

export const ExportPackageManifestSchema = z.object({
  packageVersion: z.literal(EXPORT_PACKAGE_VERSION),
  exportedAt: isoDateString,
  site: SiteSchema,
  bench: BenchSchema,
  settings: SettingsSchema.nullable(),
  requiredApps: z.array(AppSchema),
  payload: ExportPackageReferenceSchema,
  metadata: z.object({
    storageSchemaVersion: z.number().int().nonnegative(),
    appCatalogSeedVersion: z.number().int().nonnegative(),
    exportedBy: nonEmptyString,
  }),
});

export const ExportPackagePayloadSchema = z.object({
  manifestVersion: z.literal(EXPORT_PACKAGE_VERSION),
  exportedAt: isoDateString,
  data: z.object({
    site: SiteSchema,
    bench: BenchSchema,
    settings: SettingsSchema.nullable(),
    requiredApps: z.array(AppSchema),
  }),
});

export type ExportPackageManifest = z.infer<typeof ExportPackageManifestSchema>;
export type ExportPackagePayload = z.infer<typeof ExportPackagePayloadSchema>;
export type ExportPackageReference = z.infer<typeof ExportPackageReferenceSchema>;

export const createSha256 = (value: string): string => {
  return createHash('sha256').update(value).digest('hex');
};
