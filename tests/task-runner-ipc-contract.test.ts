import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../src/shared/ipc';

describe('task runner IPC channels', () => {
  it('defines the required task runner channels', () => {
    expect(ipcChannels.taskRunnerSubscribe).toBe('task-runner:subscribe');
    expect(ipcChannels.taskRunnerUnsubscribe).toBe('task-runner:unsubscribe');
    expect(ipcChannels.taskRunnerProgressEvent).toBe('task-runner:progress-event');
  });

  it('task runner channels follow the expected namespace', () => {
    const channels = [
      ipcChannels.taskRunnerSubscribe,
      ipcChannels.taskRunnerUnsubscribe,
      ipcChannels.taskRunnerProgressEvent,
    ];

    channels.forEach((channel) => {
      expect(channel).toMatch(/^task-runner:/);
    });
  });
});