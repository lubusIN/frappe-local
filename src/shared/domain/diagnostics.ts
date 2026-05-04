import { z } from 'zod';

export type DiagnosticsCheckType = 'path-writability' | 'runtime-preference' | 'storage-access' | 'runtime-health';

export const diagnosticsCheckStatuses = ['passed', 'warning', 'failed', 'skipped'] as const;
export type DiagnosticsCheckStatus = (typeof diagnosticsCheckStatuses)[number];

export type DiagnosticsCheckResult = {
  readonly type: DiagnosticsCheckType;
  readonly status: DiagnosticsCheckStatus;
  readonly title: string;
  readonly description: string;
  readonly remediation?: string;
  readonly timestamp: string;
};

export type DiagnosticsReport = {
  readonly checks: readonly DiagnosticsCheckResult[];
  readonly hasCriticalIssues: boolean;
  readonly hasWarnings: boolean;
  readonly summary: string;
  readonly completedAt: string;
  readonly appVersion: string;
};

/**
 * Diagnostics schema for storage (tracks when last diagnostics run completed)
 */
export const DiagnosticsMetadataSchema = z.object({
  lastCompletedAt: z.string().datetime().nullable(),
  lastReport: z.record(z.unknown()).nullable(),
});

export type DiagnosticsMetadata = z.infer<typeof DiagnosticsMetadataSchema>;

/**
 * Extended Settings to include diagnostics metadata
 */
export const DiagnosticsSettingsSchema = z.object({
  diagnosticsCompletedAt: z.string().datetime().nullable().optional(),
});

export type DiagnosticsSettings = z.infer<typeof DiagnosticsSettingsSchema>;
