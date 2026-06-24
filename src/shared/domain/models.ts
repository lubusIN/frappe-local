import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const isoDateString = z.string().datetime();

export const BenchStatusSchema = z.enum(['queued', 'running', 'stopped', 'success', 'failure']);
export const SiteStatusSchema = z.enum(['queued', 'ready', 'failure']);

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
  status: BenchStatusSchema,
  apps: z.array(nonEmptyString),
  timestamps: TimestampsSchema,
});

export const SiteSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  benchId: nonEmptyString,

  apps: z.array(nonEmptyString),
  status: SiteStatusSchema,
  path: nonEmptyString,
  timestamps: TimestampsSchema,
});

export const AppCompatibilitySchema = z.object({
  minimumFrappeVersion: nonEmptyString.optional(),
  maximumFrappeVersion: nonEmptyString.optional(),
  supportedBenchVersions: z.array(nonEmptyString).optional(),
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
  installBranch: nonEmptyString.optional(),
  installBranches: z.record(nonEmptyString).optional(),
  version: nonEmptyString,
  category: AppCategorySchema.default('other'),
  categories: z.array(z.string()).optional(),
  license: z.string().optional(),
  verified: z.boolean().optional(),
  icon: nonEmptyString.optional(),
  compatibility: AppCompatibilitySchema,
});

export const CustomAppSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['github', 'local']),
  source: nonEmptyString,
  branch: z.string().optional(),
  icon: z.string().optional(),
  timestamps: TimestampsSchema,
});

export const MIN_PODMAN_MEMORY_MB = 4096;

export const SettingsSchema = z.object({
  defaultFrappeVersion: nonEmptyString,
  storagePath: nonEmptyString,
  editorPreference: z.string(),
  updateChannel: z.enum(['stable', 'beta', 'alpha', 'nightly']).default('stable'),
  autoUpdateEnabled: z.boolean(),
  sidebarCompact: z.boolean().default(false),
  podmanMemoryMb: z.number().int().min(MIN_PODMAN_MEMORY_MB).default(MIN_PODMAN_MEMORY_MB),
  shareSshKeys: z.boolean().default(false),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
});

export const DEFAULT_SETTINGS: Settings = {
  defaultFrappeVersion: '16.0.0',
  storagePath: '~/Library/Application Support/Frappe Local',
  editorPreference: 'code',
  updateChannel: 'stable',
  autoUpdateEnabled: true,
  sidebarCompact: false,
  podmanMemoryMb: MIN_PODMAN_MEMORY_MB,
  shareSshKeys: false,
  theme: 'system',
};

export const CreateBenchInputSchema = BenchSchema.omit({
  id: true,
  status: true,
  timestamps: true,
});

export const UpdateBenchInputSchema = CreateBenchInputSchema.partial().extend({
  status: BenchStatusSchema.optional(),
});

export const CreateSiteInputSchema = SiteSchema.omit({
  id: true,
  status: true,
  timestamps: true,
}).extend({
  force: z.boolean().optional(),
});

export const UpdateSiteInputSchema = CreateSiteInputSchema.partial().extend({
  status: SiteStatusSchema.optional(),
});

export const UpdateSettingsInputSchema = SettingsSchema.partial();

export type Bench = z.infer<typeof BenchSchema>;
export type Site = z.infer<typeof SiteSchema>;

export type AppCatalogItem = z.infer<typeof AppSchema>;
export type CustomAppItem = z.infer<typeof CustomAppSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type CreateBenchInput = z.infer<typeof CreateBenchInputSchema>;
export type UpdateBenchInput = z.infer<typeof UpdateBenchInputSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteInputSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteInputSchema>;

export const CreateCustomAppInputSchema = CustomAppSchema.omit({
  id: true,
  timestamps: true,
}).extend({
  id: nonEmptyString.optional(),
});

export const UpdateCustomAppInputSchema = CreateCustomAppInputSchema.partial();

export type CreateCustomAppInput = z.infer<typeof CreateCustomAppInputSchema>;
export type UpdateCustomAppInput = z.infer<typeof UpdateCustomAppInputSchema>;

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;

export type BenchRecord = {
  id: string;
  name: string;
  path: string;
  frappe_version: string;
  http_port?: number;
  status: z.infer<typeof BenchStatusSchema>;
  apps: string[];
  created_at: string;
  updated_at: string;
};

export type CustomAppRecord = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  type: 'github' | 'local';
  source: string;
  branch?: string;
  icon?: string;
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

export const mapCustomAppRecordToDomain = (record: CustomAppRecord): CustomAppItem =>
  CustomAppSchema.parse({
    id: normalizeId(record.id),
    name: record.name,
    title: record.title,
    description: record.description,
    type: record.type,
    source: record.source,
    branch: record.branch,
    icon: record.icon,
    timestamps: {
      createdAt: normalizeTimestamp(record.created_at),
      updatedAt: normalizeTimestamp(record.updated_at),
    },
  });

export const mapCustomAppDomainToRecord = (app: CustomAppItem): CustomAppRecord => ({
  id: normalizeId(app.id),
  name: app.name,
  title: app.title,
  description: app.description,
  type: app.type,
  source: app.source,
  branch: app.branch,
  icon: app.icon,
  created_at: normalizeTimestamp(app.timestamps.createdAt),
  updated_at: normalizeTimestamp(app.timestamps.updatedAt),
});
