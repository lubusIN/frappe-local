import path from 'node:path';
import fs from 'node:fs/promises';
import type { AppRuntimePaths } from './config';
import type { RuntimeHealthResponse } from '../shared/ipc';
import type { Settings } from '../shared/domain/models';
import type { DiagnosticsCheckResult, DiagnosticsReport } from '../shared/domain/diagnostics';
import { createMainLogger } from './logger';

type DiagnosticsContext = {
  readonly runtimePaths: AppRuntimePaths;
  readonly runtimeService: {
    getHealth: () => Promise<RuntimeHealthResponse>;
  };
  readonly settingsRepository: {
    get: () => Promise<Settings | null>;
  };
  readonly appVersion: string;
};

const diagnosticsLogger = createMainLogger('diagnostics');

const checkPathWritability = async (targetPath: string): Promise<DiagnosticsCheckResult> => {
  const title = `Path Writability: ${targetPath}`;

  try {
    const testFile = path.join(targetPath, `.frappe-cafe-write-test-${Date.now()}`);
    await fs.writeFile(testFile, 'test', 'utf8');
    await fs.unlink(testFile);

    return {
      type: 'path-writability',
      status: 'passed',
      title,
      description: `Successfully verified write access to ${targetPath}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: 'path-writability',
      status: 'failed',
      title,
      description: `Failed to write to ${targetPath}`,
      remediation: `Ensure the directory is writable and has sufficient disk space. Error: ${message}`,
      timestamp: new Date().toISOString(),
    };
  }
};

const checkPathExists = async (targetPath: string): Promise<DiagnosticsCheckResult> => {
  const title = `Directory Access: ${targetPath}`;

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return {
        type: 'storage-access',
        status: 'failed',
        title,
        description: `Path exists but is not a directory`,
        remediation: `Remove or rename the file at ${targetPath}`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      type: 'storage-access',
      status: 'passed',
      title,
      description: `Storage directory accessible`,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      type: 'storage-access',
      status: 'warning',
      title,
      description: `Storage directory does not exist (will be created on first use)`,
      timestamp: new Date().toISOString(),
    };
  }
};

const checkRuntimePreference = (runtimePreference: string): DiagnosticsCheckResult => {
  const validRuntimes = ['docker', 'podman'];
  const isValid = validRuntimes.includes(runtimePreference);

  return {
    type: 'runtime-preference',
    status: isValid ? 'passed' : 'warning',
    title: 'Runtime Preference Configuration',
    description: isValid ? `Runtime preference set to: ${runtimePreference}` : `Unknown runtime preference: ${runtimePreference}`,
    remediation: !isValid ? `Update runtime preference in Settings to one of: ${validRuntimes.join(', ')}` : undefined,
    timestamp: new Date().toISOString(),
  };
};

const toDependencyCheck = (dependency: RuntimeHealthResponse['dependencies'][number]): DiagnosticsCheckResult => {
  const timestamp = new Date().toISOString();
  const status = dependency.status === 'ready'
    ? 'passed'
    : dependency.status === 'missing' || dependency.status === 'incompatible'
      ? 'warning'
      : 'skipped';

  return {
    type: dependency.dependency,
    status,
    title: `${dependency.guidance.title}`,
    description: dependency.summary,
    remediation: dependency.guidance.steps.join(' '),
    timestamp,
  };
};

/**
 * Run first-run and on-demand diagnostics checks
 */
export const runDiagnostics = async (context: DiagnosticsContext): Promise<DiagnosticsReport> => {
  diagnosticsLogger.info('Starting diagnostics run');

  const checks: DiagnosticsCheckResult[] = [];

  // Check path writability
  const userDataWriteCheck = await checkPathWritability(context.runtimePaths.userDataPath);
  checks.push(userDataWriteCheck);

  // Check storage directory
  const storageAccessCheck = await checkPathExists(context.runtimePaths.storagePath);
  checks.push(storageAccessCheck);

  // Check runtime preference
  const settings = await context.settingsRepository.get();
  const runtimePreference = settings?.runtimePreference ?? 'docker';
  const runtimeCheck = checkRuntimePreference(runtimePreference);
  checks.push(runtimeCheck);

  // Check dependencies
  try {
    const runtimeHealth = await context.runtimeService.getHealth();
    const dependencyChecks = runtimeHealth.dependencies.map(toDependencyCheck);
    checks.push(...dependencyChecks);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      type: 'runtime-preference',
      status: 'failed',
      title: 'Dependency health check',
      description: 'Unable to collect runtime dependency health.',
      remediation: `Retry diagnostics after resolving the runtime probe issue. Error: ${message}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Determine severity
  const failedChecks = checks.filter((c) => c.status === 'failed');
  const warningChecks = checks.filter((c) => c.status === 'warning');
  const passedChecks = checks.filter((c) => c.status === 'passed');

  let summary = '';
  if (failedChecks.length > 0) {
    summary = `${failedChecks.length} critical issue${failedChecks.length !== 1 ? 's' : ''} found. Application may not work correctly.`;
  } else if (warningChecks.length > 0) {
    summary = `${warningChecks.length} warning${warningChecks.length !== 1 ? 's' : ''} detected. Some features may be limited.`;
  } else {
    summary = `All diagnostics passed. Environment is ready.`;
  }

  const report: DiagnosticsReport = {
    checks,
    hasCriticalIssues: failedChecks.length > 0,
    hasWarnings: warningChecks.length > 0,
    summary,
    completedAt: new Date().toISOString(),
    appVersion: context.appVersion,
  };

  diagnosticsLogger.info(`Diagnostics completed: ${passedChecks.length} passed, ${warningChecks.length} warnings, ${failedChecks.length} failed`);

  return report;
};
