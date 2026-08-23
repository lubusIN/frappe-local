import { errorMessage } from '@frappe-local/shared/core';
import { execPromise } from '@frappe-local/main/utils';
import { ensureRuntimeRunning, type TaskExecutionContext } from '@frappe-local/main/services';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS } from '@frappe-local/main/constants';
import { composeBenchSiteArgs } from '@frappe-local/main/utils/podman';

export type SiteCommandEnv = {
  projectName: string;
  benchPath: string;
  runtimeCmd: string;
  runtimeEnv: NodeJS.ProcessEnv;
};

export const executeSiteCommand = async (
  context: TaskExecutionContext,
  options: {
    stepId: string;
    description: string;
    successMessage: string;
    commandName: string;
    siteName: string;
    env: SiteCommandEnv;
    timeout: { idleTimeout?: number; maxTimeout?: number };
  }
) => {
  context.startStep('runtime', 'Ensuring container runtime is available');
  await ensureRuntimeRunning((msg) => context.log('info', msg, 'runtime'));
  context.completeStep('runtime', 'Container runtime is ready');

  context.startStep(options.stepId, options.description);
  const args = composeBenchSiteArgs(options.env.projectName, options.siteName, [options.commandName]);

  let result;
  try {
    result = await execPromise(
      options.env.runtimeCmd,
      args,
      options.env.benchPath,
      (out) => context.log('info', out, options.stepId),
      options.env.runtimeEnv,
      options.timeout
    );
  } catch (err) {
    throw new Error(`Command execution failed. Please ensure the bench container is running. Error: ${errorMessage(err)}`);
  }

  if (result.code !== 0) {
    const errorOutput = (result.stderr || result.stdout || '').toLowerCase();
    if (errorOutput.includes('no such container') || errorOutput.includes('is not running') || errorOutput.includes('cannot connect to the docker daemon') || errorOutput.includes('no such service')) {
      throw new Error(`Please start the bench before running this action. Underlying error: ${result.stderr}`);
    }
    throw new Error(`Failed to ${options.commandName} for site ${options.siteName}: ${result.stderr}`);
  }

  context.completeStep(options.stepId, options.successMessage);
};

export const clearSiteCaches = async (
  context: TaskExecutionContext,
  siteName: string,
  env: SiteCommandEnv
) => {
  await executeSiteCommand(context, {
    stepId: 'cache',
    description: `Clearing cache for ${siteName}`,
    successMessage: 'Site cache cleared',
    commandName: 'clear-cache',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });

  await executeSiteCommand(context, {
    stepId: 'website-cache',
    description: `Clearing website cache for ${siteName}`,
    successMessage: 'Site website cache cleared',
    commandName: 'clear-website-cache',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });
};

export const migrateSite = async (
  context: TaskExecutionContext,
  siteName: string,
  env: SiteCommandEnv
) => {
  await executeSiteCommand(context, {
    stepId: 'migrate',
    description: `Running migrate for ${siteName}`,
    successMessage: 'Site migration completed',
    commandName: 'migrate',
    siteName,
    env,
    timeout: { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  });
};

export const restartBenchServices = async (
  context: TaskExecutionContext,
  env: SiteCommandEnv
) => {
  context.startStep('restart', 'Restarting bench processes');
  
  // Kill existing honcho/bench start process
  await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-T', 'frappe', 'pkill', '-f', 'honcho'],
    env.benchPath,
    undefined,
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  ).catch(() => ({ code: 0 })); // Ignore error if it's not running

  // Start it again
  const restartResult = await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-d', 'frappe', 'sh', '-c', 'nohup honcho start > logs/honcho.log 2>&1'],
    env.benchPath,
    (out) => context.log('info', out, 'restart'),
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  );

  if (restartResult.code !== 0) {
    throw new Error(`Failed to restart bench processes: ${restartResult.stderr}`);
  }

  await new Promise(resolve => setTimeout(resolve, 3000));
  context.completeStep('restart', 'Bench processes restarted');
};