/** Derives a consistent, short Docker Compose project name from a bench ID. */
export const getComposeProjectName = (benchId: string): string => {
  return `local-bench-${benchId.slice(0, 8)}`;
};

/** Base arguments for invoking docker-compose against a bench. */
export const benchComposeArgs = (projectName: string, composePath: string): string[] => {
  return ['-p', projectName, '-f', composePath];
};

/** Arguments to execute a generic command inside a specific container via compose. */
export const composeExecArgs = (projectName: string, containerName: string, commandArgs: string[]): string[] => {
  return ['-p', projectName, 'exec', '-T', containerName, ...commandArgs];
};

/** Arguments to execute a `bench` CLI command inside the backend container. */
export const composeBenchArgs = (projectName: string, commandArgs: string[]): string[] => {
  return composeExecArgs(projectName, 'frappe', ['bench', ...commandArgs]);
};

/** Arguments to execute a `bench` CLI command targeting a specific site. */
export const composeBenchSiteArgs = (projectName: string, siteName: string, commandArgs: string[]): string[] => {
  return composeBenchArgs(projectName, ['--site', siteName, ...commandArgs]);
};
