import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const isoDateString = z.string().datetime();


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
  httpPort: z.number().int().min(1024).max(65535).optional(),
  status: EntityStatusSchema,
  apps: z.array(nonEmptyString),
  timestamps: TimestampsSchema,
});

export const SiteSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  benchId: nonEmptyString,

  apps: z.array(nonEmptyString),
  status: EntityStatusSchema,
  path: nonEmptyString,
  timestamps: TimestampsSchema,
});



export const AppCompatibilitySchema = z.object({
  minimumFrappeVersion: nonEmptyString.optional(),
  maximumFrappeVersion: nonEmptyString.optional(),
});

export const AppCategorySchema = z.enum([
  'core',
  'business',
  'crm-support',
  'productivity',
  'learning',
  'tools',
  'other',
]);

export const AppSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string(),
  source: nonEmptyString,
  version: nonEmptyString,
  category: AppCategorySchema.default('other'),
  icon: nonEmptyString.optional(),
  compatibility: AppCompatibilitySchema,
});

export const SettingsSchema = z.object({
  defaultFrappeVersion: nonEmptyString,
  storagePath: nonEmptyString,
  editorPreference: z.string(),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  autoUpdateEnabled: z.boolean(),
  sidebarCompact: z.boolean().default(false),
});

export const CreateBenchInputSchema = BenchSchema.omit({
  id: true,
  status: true,
  timestamps: true,
});

export const UpdateBenchInputSchema = CreateBenchInputSchema.partial().extend({
  status: EntityStatusSchema.optional(),
});

export const CreateSiteInputSchema = SiteSchema.omit({
  id: true,
  status: true,
  timestamps: true,
}).extend({
  force: z.boolean().optional(),
});

export const UpdateSiteInputSchema = CreateSiteInputSchema.partial().extend({
  status: EntityStatusSchema.optional(),
});



export const UpdateSettingsInputSchema = SettingsSchema.partial();

export type Bench = z.infer<typeof BenchSchema>;
export type Site = z.infer<typeof SiteSchema>;

export type AppCatalogItem = z.infer<typeof AppSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type CreateBenchInput = z.infer<typeof CreateBenchInputSchema>;
export type UpdateBenchInput = z.infer<typeof UpdateBenchInputSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteInputSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteInputSchema>;

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;

export type BenchRecord = {
  id: string;
  name: string;
  path: string;
  frappe_version: string;
  http_port?: number;
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
    httpPort: record.http_port,
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
  http_port: bench.httpPort,
  status: bench.status,
  apps: bench.apps,
  created_at: normalizeTimestamp(bench.timestamps.createdAt),
  updated_at: normalizeTimestamp(bench.timestamps.updatedAt),
});
