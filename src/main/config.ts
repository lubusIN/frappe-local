import path from 'node:path';

type AppPathReader = {
  getPath: (name: 'userData' | 'logs') => string;
};

export type AppRuntimePaths = {
  readonly userDataPath: string;
  readonly logsPath: string;
  readonly configPath: string;
  readonly storagePath: string;
};

export const resolveAppRuntimePaths = (appPathReader: AppPathReader): AppRuntimePaths => {
  const userDataPath = appPathReader.getPath('userData');
  const logsPath = appPathReader.getPath('logs');

  return {
    userDataPath,
    logsPath,
    configPath: path.join(userDataPath, 'config'),
    storagePath: path.join(userDataPath, 'storage'),
  };
};