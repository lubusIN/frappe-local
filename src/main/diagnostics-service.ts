import path from 'node:path';
import fs from 'node:fs/promises';
import dns from 'node:dns/promises';
import type { AppRuntimePaths } from './config';

import type { DiagnosticsCheckResult, DiagnosticsReport } from '../shared/domain/diagnostics';
import type { Settings } from '../shared/domain/models';
import { createMainLogger } from './logger';
import { execPromise } from './utils/exec';
import { getBinaryPath } from './utils/binaries';
import { isPodmanMachineRequired, getPodmanMachines } from './utils/podman';
import { getRuntimeEnv } from './runtime-service';

type DiagnosticsContext = {
  readonly runtimePaths: AppRuntimePaths;

  readonly settingsRepository: {
    get: () => Promise<Settings | null>;
  };
  readonly appVersion: string;
};

const diagnosticsLogger = createMainLogger('diagnostics');

const checkNetworkConnectivity = async (): Promise<DiagnosticsCheckResult> => {
  const title = 'Internet Connectivity';
  try {
    await dns.lookup('google.com');
    return {
      type: 'runtime-health',
      status: 'passed',
      title,
      description: 'System is connected to the internet. Internet access is required for downloading app templates and syncing the app catalog.',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      type: 'runtime-health',
      status: 'warning',
      title,
      description: 'System appears to be offline',
      remediation: 'Check your internet connection. Some features like template updates and catalog syncing will be unavailable.',
      timestamp: new Date().toISOString(),
    };
  }
};

let lastReport: DiagnosticsReport | null = null;

export const getLastDiagnosticsReport = (): DiagnosticsReport | null => {
  return lastReport;
};

const checkPathWritability = async (targetPath: string): Promise<DiagnosticsCheckResult> => {
  const title = `Path Writability: ${targetPath}`;

  try {
    const testFile = path.join(targetPath, `.local-bench-write-test-${Date.now()}`);
    await fs.writeFile(testFile, 'test', 'utf8');
    await fs.unlink(testFile);

    return {
      type: 'path-writability',
      status: 'passed',
      title,
      description: `Successfully verified write access to ${targetPath}. Local Bench needs this to store bench templates and site metadata.`,
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
      description: `Storage directory accessible. Local Bench uses this to store bench templates and site metadata.`,
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



const checkDockerComposeHealth = async (): Promise<DiagnosticsCheckResult[]> => {
  const checks: DiagnosticsCheckResult[] = [];
  
  try {
    const { code } = await execPromise(getBinaryPath('docker-compose'), ['--version'], undefined, undefined, undefined, 10000);
    if (code === 0) {
      checks.push({
        type: 'runtime-health',
        status: 'passed',
        title: 'Docker Compose Binary',
        description: 'docker-compose binary is available and executable',
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error('Non-zero exit code');
    }
  } catch {
    checks.push({
      type: 'runtime-health',
      status: 'failed',
      title: 'Docker Compose Binary',
      description: 'docker-compose binary not found or not executable',
      remediation: 'Install docker-compose and ensure it is in your PATH.',
      timestamp: new Date().toISOString(),
    });
  }

  return checks;
};


const checkPodmanHealth = async (): Promise<DiagnosticsCheckResult[]> => {
  const checks: DiagnosticsCheckResult[] = [];
  let podmanAvailable = false;

  const failureStatus = 'failed';

  // Check 1: Podman Binary
  try {
    const { code } = await execPromise(getBinaryPath('podman'), ['--version'], undefined, undefined, undefined, 10000);
    if (code === 0) {
      podmanAvailable = true;
      checks.push({
        type: 'runtime-health',
        status: 'passed',
        title: 'Podman Binary',
        description: 'Podman binary is available and executable',
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error('Non-zero exit code');
    }
  } catch {
    checks.push({
      type: 'runtime-health',
      status: failureStatus,
      title: 'Podman Binary',
      description: 'Podman binary not found or not executable',
      remediation: 'Install Podman from https://podman.io/ and ensure it is in your PATH.',
      timestamp: new Date().toISOString(),
    });
    return checks; // Cannot proceed with further podman checks
  }

  if (podmanAvailable) {
    const isVmRequired = isPodmanMachineRequired();
    
    checks.push({
      type: 'runtime-health',
      status: 'passed',
      title: 'Environment Requirement',
      description: isVmRequired ? 'A Linux VM (Podman Machine) is required on this platform' : 'No VM required (Native Linux)',
      timestamp: new Date().toISOString(),
    });

    if (isVmRequired) {
      try {
        const machines = await getPodmanMachines();

        if (machines.length > 0) {
          const activeMachine = machines.find(
            (machine) =>
              machine.CurrentlyRunning === true ||
              machine.Running === true ||
              machine.State === 'running'
          );

          if (activeMachine) {
            checks.push({
              type: 'runtime-health',
              status: 'passed',
              title: 'Podman Machine',
              description: `Podman machine '${activeMachine.Name}' is running. On macOS and Windows, this virtual machine is required to run Linux containers.`,
              timestamp: new Date().toISOString(),
            });
          } else {
            checks.push({
              type: 'runtime-health',
              status: failureStatus,
              title: 'Podman Machine',
              description: 'Podman machine exists but is not running. On macOS and Windows, Podman requires an active virtual machine to function.',
              remediation: 'Click "Attempt Fix" to start the Podman machine.',
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          checks.push({
            type: 'runtime-health',
            status: failureStatus,
            title: 'Podman Machine',
            description: 'No Podman machine found',
            remediation: 'Click "Attempt Fix" to initialize and start a new Podman machine.',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        checks.push({
          type: 'runtime-health',
          status: failureStatus,
          title: 'Podman Machine',
          description: `Unable to query Podman machine status: ${err instanceof Error ? err.message : 'Unknown error'}`,
          remediation: 'Ensure Podman Desktop is running or check `podman machine ls` manually.',
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      checks.push({
        type: 'runtime-health',
        status: 'skipped',
        title: 'Podman Machine',
        description: 'Podman machine is not required on native Linux environments.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Check 3: Podman Engine Connection
  if (podmanAvailable) {
    try {
      const { code } = await execPromise(getBinaryPath('podman'), ['ps'], undefined, undefined, undefined, 10000);
      if (code === 0) {
        checks.push({
          type: 'runtime-health',
          status: 'passed',
          title: 'Podman Engine',
          description: 'Podman engine is running and accepting connections',
          timestamp: new Date().toISOString(),
        });
      } else {
        checks.push({
          type: 'runtime-health',
          status: failureStatus,
          title: 'Podman Engine',
          description: 'Cannot connect to Podman engine',
          remediation: 'Ensure the Podman machine or service is started.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Already handled by binary availability check
    }

    // Check 4: Orchestrator Engine Connection
    try {
      const runtimeEnv = await getRuntimeEnv();
      const { code, stderr } = await execPromise(getBinaryPath('docker-compose'), ['version'], undefined, undefined, runtimeEnv, 10000);
      if (code === 0) {
        checks.push({
          type: 'runtime-health',
          status: 'passed',
          title: 'Orchestrator Connection',
          description: `Orchestrator connected to engine via ${runtimeEnv.DOCKER_HOST || 'default socket'}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        checks.push({
          type: 'runtime-health',
          status: failureStatus,
          title: 'Orchestrator Connection',
          description: `Orchestrator failed to connect to engine: ${stderr}`,
          remediation: 'Verify Podman socket availability and DOCKER_HOST configuration.',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      checks.push({
        type: 'runtime-health',
        status: failureStatus,
        title: 'Orchestrator Connection',
        description: `Failed to test orchestrator connectivity: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return checks;
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

  const podmanChecks = await checkPodmanHealth();
  checks.push(...podmanChecks);

  const dockerComposeChecks = await checkDockerComposeHealth();
  checks.push(...dockerComposeChecks);

  // Check network connectivity
  const networkCheck = await checkNetworkConnectivity();
  checks.push(networkCheck);

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

  lastReport = report;

  diagnosticsLogger.info(`Diagnostics completed: ${passedChecks.length} passed, ${warningChecks.length} warnings, ${failedChecks.length} failed`);

  return report;
};
