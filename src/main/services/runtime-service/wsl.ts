import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execPromise } from '@frappe-local/main/utils';
import type { TaskExecutionContext } from '@frappe-local/main/services/task-runner';

export const isWslInstalled = async (): Promise<boolean> => {
  if (process.platform !== 'win32') return true;
  try {
    const { code } = await execPromise('wsl.exe', ['--status'], undefined, undefined, undefined, { idleTimeout: 5000 });
    return code === 0;
  } catch {
    return false;
  }
};

export const installWslTask = async (context: TaskExecutionContext): Promise<void> => {
  if (process.platform !== 'win32') return;

  context.startStep('wsl-install', 'Installing Windows Subsystem for Linux (WSL2)');
  context.log('info', 'Preparing WSL installation...', 'wsl-install');

  const crypto = await import('node:crypto');
  const logFile = path.join(os.tmpdir(), `wsl-install-${crypto.randomUUID()}.log`);
  fs.writeFileSync(logFile, '', 'utf8');

  let position = 0;
  const pollLogs = () => {
    try {
      if (!fs.existsSync(logFile)) return;
      const fd = fs.openSync(logFile, 'r');
      const stat = fs.fstatSync(fd);
      if (stat.size > position) {
        const buffer = Buffer.alloc(stat.size - position);
        fs.readSync(fd, buffer, 0, buffer.length, position);
        position = stat.size;
        fs.closeSync(fd);

        const text = buffer.toString('utf8').split('\0').join('');
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (line.trim()) {
            context.log('info', line.trim(), 'wsl-install');
          }
        }
      } else {
        fs.closeSync(fd);
      }
    } catch {
      // ignore
    }
  };

  const timer = setInterval(pollLogs, 500);

  try {
    context.log('info', 'Requesting elevated privileges. Please accept the UAC prompt if it appears...', 'wsl-install');

    const psCommand = `Start-Process powershell.exe -ArgumentList "-NoProfile -Command \`"wsl.exe --install *>&1 | Out-File -FilePath '${logFile}' -Encoding utf8\`"" -Verb RunAs -WindowStyle Hidden -Wait`;

    const { code, stderr } = await execPromise('powershell.exe', [
      '-NoProfile',
      '-Command',
      psCommand
    ], undefined, undefined, undefined, { idleTimeout: 600000, maxTimeout: 1200000 });

    clearInterval(timer);
    pollLogs();

    if (code !== 0) {
      throw new Error(`Elevated WSL installation failed with exit code ${code}. ${stderr}`);
    }

    context.completeStep('wsl-install', 'Installing Windows Subsystem for Linux (WSL2)', 'WSL installation completed successfully.');
  } finally {
    clearInterval(timer);
    try {
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    } catch {
      // ignore
    }
  }
};
