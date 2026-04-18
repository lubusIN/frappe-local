import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const isoDateString = z.string().datetime();

export const RuntimeSchema = z.enum(['docker', 'podman']);
export const EntityStatusSchema = z.enum(['queued', 'running', 'stopped', 'success', 'failure']);

export const TimestampsSchema = z.object({
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const BenchSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  path: nonEmptyString,
  frappeVersion: nonEmptyString,
  runtime: RuntimeSchema,
  status: EntityStatusSchema,
  apps: z.array(nonEmptyString),
  timestamps: TimestampsSchema,
});

export const SiteSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  benchId: nonEmptyString,
  groupId: nonEmptyString.nullable(),
  apps: z.array(nonEmptyString),
  status: EntityStatusSchema,
  path: nonEmptyString,
  timestamps: TimestampsSchema,
});

export const GroupSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string(),
  tags: z.array(nonEmptyString),
  siteIds: z.array(nonEmptyString),
});

export const AppCompatibilitySchema = z.object({
  minimumFrappeVersion: nonEmptyString.optional(),
  maximumFrappeVersion: nonEmptyString.optional(),
  supportedRuntimes: z.array(RuntimeSchema).default(['docker', 'podman']),
});

export const AppSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string(),
  source: nonEmptyString,
  version: nonEmptyString,
  compatibility: AppCompatibilitySchema,
});

export const SettingsSchema = z.object({
  defaultFrappeVersion: nonEmptyString,
  runtimePreference: RuntimeSchema,
  storagePath: nonEmptyString,
  terminalPreference: z.string(),
  editorPreference: z.string(),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  autoUpdateEnabled: z.boolean(),
});

export const CreateBenchInputSchema = BenchSchema.omit({
  id: true,
  timestamps: true,
});

export const UpdateBenchInputSchema = CreateBenchInputSchema.partial();

export const CreateSiteInputSchema = SiteSchema.omit({
  id: true,
  timestamps: true,
});

export const UpdateSiteInputSchema = CreateSiteInputSchema.partial();

export const CreateGroupInputSchema = GroupSchema.omit({
  id: true,
});

export const UpdateGroupInputSchema = CreateGroupInputSchema.partial();

export const UpdateSettingsInputSchema = SettingsSchema.partial();

export type Bench = z.infer<typeof BenchSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type AppCatalogItem = z.infer<typeof AppSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type BenchRecord = {
  id: string;
  name: string;
  path: string;
  frappe_version: string;
  runtime: z.infer<typeof RuntimeSchema>;
  status: z.infer<typeof EntityStatusSchema>;
  apps: string[];
  created_at: string;
  updated_at: string;
};

export const normalizeId = (value: string): string => value.trim();

export const normalizeTimestamp = (value: string): string => {
  const parsedDate = new Date(value);
  return parsedDate.toISOString();
};

export const mapBenchRecordToDomain = (record: BenchRecord): Bench =>
  BenchSchema.parse({
    id: normalizeId(record.id),
    name: record.name,
    path: record.path,
    frappeVersion: record.frappe_version,
    runtime: record.runtime,
    status: record.status,
    apps: record.apps,
    timestamps: {
      createdAt: normalizeTimestamp(record.created_at),
      updatedAt: normalizeTimestamp(record.updated_at),
    },
  });

export const mapBenchDomainToRecord = (bench: Bench): BenchRecord => ({
  id: normalizeId(bench.id),
  name: bench.name,
  path: bench.path,
  frappe_version: bench.frappeVersion,
  runtime: bench.runtime,
  status: bench.status,
  apps: bench.apps,
  created_at: normalizeTimestamp(bench.timestamps.createdAt),
  updated_at: normalizeTimestamp(bench.timestamps.updatedAt),
});
