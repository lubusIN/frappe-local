import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildDependencyGuidance,
  compareDependencyVersions,
  minimumDependencyVersions,
  parseDependencyVersion,
  toDependencyHealth,
  type DependencyErrorCode,
  type DependencyHealth,
  type DependencyType,
} from '../shared/domain/runtime-health';

const execFileAsync = promisify(execFile);

export type CommandExecutionResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly timeoutMs?: number }
) => Promise<CommandExecutionResult>;

export type DependencyDetectionResult = {
  readonly health: DependencyHealth;
  readonly errorCode: DependencyErrorCode | null;
};

export type DependencyAggregateHealth = {
  readonly dependencies: DependencyDetectionResult[];
  readonly hasBlockingIssues: boolean;
};

const defaultTimeoutMs = 5000;

const dependencyProbes: Record<DependencyType, readonly { command: string; args: readonly string[] }[]> = {
  podman: [{ command: 'podman', args: ['--version'] }],
  'docker-compose': [
    { command: 'docker', args: ['compose', 'version', '--short'] },
    { command: 'docker-compose', args: ['--version'] },
  ],
  git: [{ command: 'git', args: ['--version'] }],
};

const normalizeCommandFailure = (error: unknown): DependencyErrorCode => {
  if (!(error instanceof Error)) {
    return 'unknown-error';
  }

  const message = error.message.toLowerCase();
  const systemError = error as NodeJS.ErrnoException;

  if (systemError.code === 'ENOENT' || message.includes('not found')) {
    return 'not-found';
  }

  if (systemError.code === 'EACCES' || message.includes('permission denied')) {
    return 'permission-denied';
  }

  if (message.includes('timed out') || message.includes('timeout') || systemError.code === 'ETIMEDOUT') {
    return 'execution-timeout';
  }

  return 'execution-failed';
};

const guidanceForError = (dependency: DependencyType, code: DependencyErrorCode, minimumVersion: string) => {
  if (code === 'not-found') {
    return buildDependencyGuidance(dependency, 'missing', minimumVersion);
  }

  if (code === 'unsupported-version') {
    return buildDependencyGuidance(dependency, 'incompatible', minimumVersion);
  }

  return {
    title: `Review ${dependency}`,
    steps: [
      'Verify the command can run in your shell environment.',
      'Retry the readiness check after fixing the local environment.',
    ],
  };
};

export const runShellCommand: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, [...args], {
    timeout: options?.timeoutMs ?? defaultTimeoutMs,
    windowsHide: true,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: 0,
  };
};

export const detectDependency = async (
  dependency: DependencyType,
  runner: CommandRunner = runShellCommand
): Promise<DependencyDetectionResult> => {
  const minimumVersion = minimumDependencyVersions[dependency];
  let lastErrorCode: DependencyErrorCode | null = null;

  for (const probe of dependencyProbes[dependency]) {
    try {
      const result = await runner(probe.command, probe.args, { timeoutMs: defaultTimeoutMs });
      const output = `${result.stdout}\n${result.stderr}`.trim();
      const detectedVersion = parseDependencyVersion(output);

      if (!detectedVersion) {
        return {
          health: {
            dependency,
            status: 'unknown',
            detectedVersion: null,
            requiredVersion: minimumVersion,
            summary: `${dependency} responded, but its version output could not be parsed.`,
            guidance: guidanceForError(dependency, 'unparseable-version', minimumVersion),
          },
          errorCode: 'unparseable-version',
        };
      }

      const minimum = parseDependencyVersion(minimumVersion);
      const versionStatus = compareDependencyVersions(detectedVersion, minimum) >= 0 ? 'ready' : 'incompatible';

      return {
        health: toDependencyHealth({
          dependency,
          installed: true,
          version: detectedVersion.raw,
          minimumVersion,
          status: versionStatus,
        }),
        errorCode: versionStatus === 'incompatible' ? 'unsupported-version' : null,
      };
    } catch (error) {
      lastErrorCode = normalizeCommandFailure(error);
      if (lastErrorCode !== 'not-found') {
        return {
          health: {
            dependency,
            status: 'unknown',
            detectedVersion: null,
            requiredVersion: minimumVersion,
            summary: `${dependency} could not be checked because the command failed.`,
            guidance: guidanceForError(dependency, lastErrorCode, minimumVersion),
          },
          errorCode: lastErrorCode,
        };
      }
    }
  }

  return {
    health: toDependencyHealth({
      dependency,
      installed: false,
      version: null,
      minimumVersion,
      status: 'missing',
    }),
    errorCode: lastErrorCode ?? 'not-found',
  };
};

export const detectAllDependencies = async (
  runner: CommandRunner = runShellCommand
): Promise<DependencyAggregateHealth> => {
  const dependencies = await Promise.all(
    (['podman', 'docker-compose', 'git'] as const).map((dependency) => detectDependency(dependency, runner))
  );

  return {
    dependencies,
    hasBlockingIssues: dependencies.some((entry) => entry.health.status !== 'ready'),
  };
};